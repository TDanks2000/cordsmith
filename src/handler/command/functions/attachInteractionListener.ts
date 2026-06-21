import type {
	ChatInputCommandInteraction,
	Collection,
	InteractionReplyOptions,
	MessageComponentInteraction,
	ModalSubmitInteraction,
} from "discord.js";
import type { ClientClass } from "../../../structure/Client";
import { logger } from "../../../utils";
import type { CommandContext, SlashCommand } from "../../@types/command";
import type { Precondition } from "../../@types/precondition";
import type { CooldownStore } from "./cooldowns";
import { parseCustomId } from "./customId";
import { runPreconditions } from "./runPreconditions";
import { isUserError } from "./UserError";

export type AttachedInteractionListener = {
	eventName: "interactionCreate";
	fn: (interaction: any) => void;
};

// RepliableInteraction from discord.js is a union of *concrete* narrowed types,
// so the abstract base classes (MessageComponentInteraction etc.) aren't
// assignable to it. This structural type targets only what replySafe actually
// needs, which is both correct and sufficient.
type Repliable = {
	deferred: boolean;
	replied: boolean;
	reply: (options: InteractionReplyOptions) => Promise<unknown>;
	followUp: (options: InteractionReplyOptions) => Promise<unknown>;
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

function enforceComponentOwnerOnly(options: {
	cmd: SlashCommand;
	payload: string | undefined;
	userId: string;
}): { ok: true } | { ok: false; message: string } {
	const { cmd, payload, userId } = options;

	if (!cmd.meta?.componentOwnerOnly) return { ok: true };

	if (!payload) {
		return {
			ok: false,
			message:
				"This interaction is missing an owner payload. Re-run the command.",
		};
	}

	// Allow payload formats: "<userId>" or "<userId>:<anything>"
	const ownerId = payload.split(":")[0];

	if (ownerId !== userId) {
		return { ok: false, message: "This interaction isn't for you." };
	}

	return { ok: true };
}

type ComponentCtx<T> = {
	interaction: T;
	client: ClientClass;
	action: string;
	payload?: string;
};

export type InteractionErrorMessages = {
	genericError?: string;
	componentOwnerOnly?: string;
	missingPayload?: string;
};

export type SlashCommandHooks = {
	beforeExecute?: (
		ctx: CommandContext<ChatInputCommandInteraction>,
	) => Promise<boolean | void> | boolean | void;
	afterExecute?: (
		ctx: CommandContext<ChatInputCommandInteraction>,
	) => Promise<void> | void;
	onCommandError?: (
		err: unknown,
		ctx: CommandContext<ChatInputCommandInteraction>,
	) => Promise<void> | void;
};

async function replyGenericIfNeeded(
	interaction: Repliable,
	content: string,
): Promise<void> {
	if (interaction.deferred || interaction.replied) return;

	await replySafe(interaction, {
		content,
		ephemeral: true,
	});
}

/**
 * Shared routing logic for button, select menu, and modal interactions.
 *
 * Generic over T so each call site keeps its concrete interaction type,
 * avoiding the contravariance errors that arise from a wide union handler type.
 */
async function routeComponentInteraction<
	T extends MessageComponentInteraction | ModalSubmitInteraction,
>(options: {
	interaction: T;
	commands: Collection<string, SlashCommand>;
	client: ClientClass;
	getHandler: (
		cmd: SlashCommand,
		action: string,
	) => ((ctx: ComponentCtx<T>) => Promise<void>) | undefined;
	label: string;
	errorMessages?: InteractionErrorMessages;
}): Promise<void> {
	const { interaction, commands, client, getHandler, label, errorMessages } =
		options;

	const parsed = parseCustomId(interaction.customId);
	if (!parsed.ok) return;

	const cmd = commands.get(parsed.commandName);
	if (!cmd) return;

	const handler = getHandler(cmd, parsed.action);
	if (!handler) return;

	const ownerCheck = enforceComponentOwnerOnly({
		cmd,
		payload: parsed.payload,
		userId: interaction.user.id,
	});

	if (!ownerCheck.ok) {
		await replySafe(interaction, {
			content:
				parsed.payload === undefined
					? (errorMessages?.missingPayload ?? ownerCheck.message)
					: (errorMessages?.componentOwnerOnly ?? ownerCheck.message),
			ephemeral: true,
		});
		return;
	}

	try {
		await handler({
			interaction,
			client,
			action: parsed.action,
			payload: parsed.payload,
		});
	} catch (err) {
		if (isUserError(err)) {
			await replySafe(interaction, {
				content: err.message,
				ephemeral: err.ephemeral,
			});
			return;
		}

		logger.error(
			`Error in ${label} handler for "${parsed.commandName}:${parsed.action}"`,
			err,
		);

		await replySafe(interaction, {
			content: errorMessages?.genericError ?? "Something went wrong.",
			ephemeral: true,
		});
	}
}

export function attachInteractionListener(options: {
	client: ClientClass;
	commands: Collection<string, SlashCommand>;
	ownerIds: Set<string>;
	cooldowns: CooldownStore;
	preconditionRegistry: Map<string, Precondition>;
	errorMessages?: InteractionErrorMessages;
	onError?: (
		err: unknown,
		ctx: { interaction: any; commandName: string },
	) => Promise<void> | void;
	hooks?: SlashCommandHooks;
}): AttachedInteractionListener {
	const {
		client,
		commands,
		ownerIds,
		cooldowns,
		preconditionRegistry,
		errorMessages,
		onError,
		hooks,
	} = options;
	const genericError =
		errorMessages?.genericError ??
		"Something went wrong while running that command.";

	const fn = async (interaction: any) => {
		// ---- Autocomplete routing ----
		if (interaction.isAutocomplete()) {
			const command = commands.get(interaction.commandName);
			if (!command?.autocomplete) return;

			try {
				await command.autocomplete({ interaction, client });
			} catch (err) {
				logger.error(
					`Error in autocomplete for "${interaction.commandName}"`,
					err,
				);
			}

			return;
		}

		// ---- Button routing ----
		if (interaction.isButton()) {
			await routeComponentInteraction({
				interaction,
				commands,
				client,
				getHandler: (cmd, action) => cmd.buttons?.[action],
				label: "button",
				errorMessages,
			});
			return;
		}

		// ---- Select menu routing ----
		if (interaction.isAnySelectMenu()) {
			await routeComponentInteraction({
				interaction,
				commands,
				client,
				getHandler: (cmd, action) => cmd.selectMenus?.[action],
				label: "select menu",
				errorMessages,
			});
			return;
		}

		// ---- Modal routing ----
		if (interaction.isModalSubmit()) {
			await routeComponentInteraction({
				interaction,
				commands,
				client,
				getHandler: (cmd, action) => cmd.modals?.[action],
				label: "modal",
				errorMessages,
			});
			return;
		}

		// ---- Slash command routing ----
		if (!interaction.isChatInputCommand()) return;

		const command = commands.get(interaction.commandName);

		if (!command) {
			// Don't expose internal state to users — log it instead.
			logger.warn(
				`Received unknown slash command: "${interaction.commandName}"`,
			);
			return;
		}

		// Run all preconditions (built-ins + any custom ones declared on the command)
		const result = await runPreconditions({
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
			await interaction.reply({
				content: result.failure.message,
				ephemeral: result.failure.ephemeral,
			});
			return;
		}

		try {
			const ctx = { interaction, client };
			try {
				const shouldContinue = await hooks?.beforeExecute?.(ctx);
				if (shouldContinue === false) return;
			} catch (err) {
				logger.error(
					`Error in beforeExecute hook for "${interaction.commandName}"`,
					err,
				);
				return;
			}

			if (command.subcommands) {
				const subName = interaction.options.getSubcommand(false);
				const groupName = interaction.options.getSubcommandGroup(false);
				const key = groupName ? `${groupName}/${subName}` : subName;

				if (key && command.subcommands[key]) {
					await command.subcommands[key](ctx);
					await hooks?.afterExecute?.(ctx);
					return;
				}
			}

			await command.execute(ctx);
			await hooks?.afterExecute?.(ctx);
		} catch (err) {
			if (isUserError(err)) {
				await replySafe(interaction, {
					content: err.message,
					ephemeral: err.ephemeral,
				});
				return;
			}

			logger.error(`Error executing "${interaction.commandName}"`, err);

			try {
				await hooks?.onCommandError?.(err, { interaction, client });
			} catch (hookErr) {
				logger.error(
					`Error in onCommandError hook for "${interaction.commandName}"`,
					hookErr,
				);
			}

			try {
				await onError?.(err, {
					interaction,
					commandName: interaction.commandName,
				});
			} catch (onErrorErr) {
				logger.error(
					`Error in onError callback for "${interaction.commandName}"`,
					onErrorErr,
				);
			}

			await replyGenericIfNeeded(interaction, genericError);
		}
	};

	client.on("interactionCreate", fn);

	return {
		eventName: "interactionCreate",
		fn,
	};
}
