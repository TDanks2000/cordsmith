import type {
	Collection,
	MessageContextMenuCommandInteraction,
	UserContextMenuCommandInteraction,
} from "discord.js";
import type { ClientClass } from "../../../structure/Client";
import { logger } from "../../../utils";
import type { ContextMenuCommand } from "../../@types/contextMenu";
import type { Precondition } from "../../@types/precondition";
import type { CooldownStore } from "../../command/functions/cooldowns";
import {
	createPreconditionResolver,
	runPreconditions,
} from "../../command/functions/runPreconditions";
import { isUserError } from "../../command/functions/UserError";
import { replySafe } from "../../utils/reply";

type AnyContextMenuInteraction =
	| UserContextMenuCommandInteraction
	| MessageContextMenuCommandInteraction;

export type AttachedContextMenuListener = {
	eventName: "interactionCreate";
	fn: (interaction: any) => Promise<void>;
};

export type ContextMenuErrorMessages = {
	genericError?: string;
};

export type ContextMenuErrorCallback = (
	err: unknown,
	ctx: { interaction: AnyContextMenuInteraction; commandName: string },
) => Promise<void> | void;

export function attachContextMenuListener(options: {
	client: ClientClass;
	commands: Collection<string, ContextMenuCommand>;
	ownerIds: Set<string>;
	cooldowns: CooldownStore;
	preconditionRegistry: Map<string, Precondition>;
	errorMessages?: ContextMenuErrorMessages;
	onError?: ContextMenuErrorCallback;
}): AttachedContextMenuListener {
	const {
		client,
		commands,
		ownerIds,
		cooldowns,
		preconditionRegistry,
		errorMessages,
		onError,
	} = options;

	const genericError = errorMessages?.genericError ?? "Something went wrong.";
	const preconditionsFor = createPreconditionResolver(preconditionRegistry);

	/**
	 * Shared routing logic for both user and message context menu interactions.
	 */
	async function route(
		interaction: AnyContextMenuInteraction,
		type: ContextMenuCommand["type"],
	): Promise<void> {
		const { commandName } = interaction;
		const command = commands.get(commandName);

		if (!command || command.type !== type) {
			logger.warn(`Received unknown ${type} context menu: "${commandName}"`);
			return;
		}

		const chain = preconditionsFor(command);

		if (chain.length > 0) {
			const result = await runPreconditions(chain, {
				interaction,
				client,
				meta: command.meta ?? {},
				ownerIds,
				cooldowns,
			});

			if (!result.ok) {
				await replySafe(
					interaction,
					result.failure.message,
					result.failure.ephemeral,
				);
				return;
			}
		}

		try {
			// `type` was checked above, so the interaction matches the command.
			await command.execute({ interaction: interaction as never, client });
		} catch (err) {
			if (isUserError(err)) {
				await replySafe(interaction, err.message, err.ephemeral);
				return;
			}

			logger.error(
				`Error executing ${type} context menu "${commandName}"`,
				err,
			);

			if (onError) {
				try {
					await onError(err, { interaction, commandName });
				} catch (onErrorErr) {
					logger.error(
						`Error in onError callback for "${commandName}"`,
						onErrorErr,
					);
				}
			}

			if (!interaction.deferred && !interaction.replied) {
				await replySafe(interaction, genericError);
			}
		}
	}

	const fn = async (interaction: any): Promise<void> => {
		try {
			if (interaction.isUserContextMenuCommand()) {
				await route(interaction, "user");
			} else if (interaction.isMessageContextMenuCommand()) {
				await route(interaction, "message");
			}
		} catch (err) {
			logger.error("Unhandled error while routing context menu", err);
		}
	};

	client.on("interactionCreate", fn);

	return {
		eventName: "interactionCreate",
		fn,
	};
}
