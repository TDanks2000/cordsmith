import type {
	Collection,
	InteractionReplyOptions,
	MessageContextMenuCommandInteraction,
	UserContextMenuCommandInteraction,
} from "discord.js";
import type { ClientClass } from "../../../structure/Client";
import { logger } from "../../../utils";
import type { ContextMenuCommand } from "../../@types/contextMenu";
import type { Precondition } from "../../@types/precondition";
import type { CooldownStore } from "../../command/functions/cooldowns";
import { isUserError } from "../../command/functions/UserError";
import { runContextMenuPreconditions } from "./runContextMenuPreconditions";

type AnyContextMenuInteraction =
	| UserContextMenuCommandInteraction
	| MessageContextMenuCommandInteraction;

type Repliable = {
	deferred: boolean;
	replied: boolean;
	reply: (options: InteractionReplyOptions) => Promise<unknown>;
	followUp: (options: InteractionReplyOptions) => Promise<unknown>;
};

export type AttachedContextMenuListener = {
	eventName: "interactionCreate";
	fn: (interaction: any) => void;
};

async function replySafe(
	interaction: Repliable,
	payload: InteractionReplyOptions,
): Promise<void> {
	if (interaction.deferred || interaction.replied) {
		await interaction.followUp(payload);
	} else {
		await interaction.reply(payload);
	}
}

/**
 * Shared routing logic for both user and message context menu interactions.
 * Previously duplicated across two identical blocks.
 */
async function routeContextMenuInteraction<
	T extends AnyContextMenuInteraction,
>(options: {
	interaction: T;
	command: ContextMenuCommand & {
		execute: (ctx: { interaction: T; client: ClientClass }) => Promise<void>;
	};
	client: ClientClass;
	ownerIds: Set<string>;
	cooldowns: CooldownStore;
	preconditionRegistry: Map<string, Precondition>;
	label: string;
}): Promise<void> {
	const {
		interaction,
		command,
		client,
		ownerIds,
		cooldowns,
		preconditionRegistry,
		label,
	} = options;

	const result = await runContextMenuPreconditions({
		ctx: {
			interaction,
			client,
			meta: command.meta ?? {},
			ownerIds,
			cooldowns,
		},
		registry: preconditionRegistry,
	});

	if (!result.ok) {
		await replySafe(interaction, {
			content: result.failure.message,
			ephemeral: result.failure.ephemeral,
		});
		return;
	}

	try {
		await command.execute({ interaction, client });
	} catch (err) {
		if (isUserError(err)) {
			await replySafe(interaction, {
				content: err.message,
				ephemeral: err.ephemeral,
			});
			return;
		}

		logger.error(
			`Error executing ${label} context menu "${interaction.commandName}"`,
			err,
		);

		await replySafe(interaction, {
			content: "Something went wrong.",
			ephemeral: true,
		});
	}
}

export function attachContextMenuListener(options: {
	client: ClientClass;
	commands: Collection<string, ContextMenuCommand>;
	ownerIds: Set<string>;
	cooldowns: CooldownStore;
	preconditionRegistry: Map<string, Precondition>;
}): AttachedContextMenuListener {
	const { client, commands, ownerIds, cooldowns, preconditionRegistry } =
		options;

	const fn = async (interaction: any) => {
		// ---- User context menu ----
		if (interaction.isUserContextMenuCommand()) {
			const command = commands.get(interaction.commandName);

			if (!command || command.type !== "user") {
				logger.warn(
					`Received unknown user context menu: "${interaction.commandName}"`,
				);
				return;
			}

			await routeContextMenuInteraction({
				interaction,
				command,
				client,
				ownerIds,
				cooldowns,
				preconditionRegistry,
				label: "user",
			});
			return;
		}

		// ---- Message context menu ----
		if (interaction.isMessageContextMenuCommand()) {
			const command = commands.get(interaction.commandName);

			if (!command || command.type !== "message") {
				logger.warn(
					`Received unknown message context menu: "${interaction.commandName}"`,
				);
				return;
			}

			await routeContextMenuInteraction({
				interaction,
				command,
				client,
				ownerIds,
				cooldowns,
				preconditionRegistry,
				label: "message",
			});
		}
	};

	client.on("interactionCreate", fn);

	return {
		eventName: "interactionCreate",
		fn,
	};
}
