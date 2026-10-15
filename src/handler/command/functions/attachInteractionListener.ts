import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	Collection,
	MessageComponentInteraction,
	ModalSubmitInteraction,
} from "discord.js";
import type { ClientClass } from "../../../structure/Client";
import { logger } from "../../../utils";
import type { CommandContext, SlashCommand } from "../../@types/command";
import type { Precondition } from "../../@types/precondition";
import { replySafe } from "../../utils/reply";
import type { CooldownStore } from "./cooldowns";
import { parseCustomId } from "./customId";
import { createPreconditionResolver, runPreconditions } from "./runPreconditions";
import { isUserError } from "./UserError";

export type AttachedInteractionListener = {
	eventName: "interactionCreate";
	fn: (interaction: any) => Promise<void>;
};

type ComponentCtx<T> = {
	interaction: T;
	client: ClientClass;
	action: string;
	payload?: string;
};

type ComponentHandlerFn<T> = (ctx: ComponentCtx<T>) => Promise<void>;

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

export type InteractionErrorCallback = (
	err: unknown,
	ctx: { interaction: any; commandName: string },
) => Promise<void> | void;

/** Await an optional user callback, logging instead of throwing. */
async function invokeSafely(
	label: string,
	fn: () => Promise<unknown> | unknown,
): Promise<void> {
	try {
		await fn();
	} catch (err) {
		logger.error(`Error in ${label}`, err);
	}
}

/**
 * Validate the owner segment of a component payload when the command uses
 * `componentOwnerOnly`. Payload formats: "<userId>" or "<userId>:<anything>".
 * Returns an error message, or null if the user may proceed.
 */
function checkComponentOwner(
	cmd: SlashCommand,
	payload: string | undefined,
	userId: string,
	errorMessages: InteractionErrorMessages | undefined,
): string | null {
	if (!cmd.meta?.componentOwnerOnly) return null;

	if (!payload) {
		return (
			errorMessages?.missingPayload ??
			"This interaction is missing an owner payload. Re-run the command."
		);
	}

	const sep = payload.indexOf(":");
	const ownerId = sep === -1 ? payload : payload.slice(0, sep);

	return ownerId === userId
		? null
		: (errorMessages?.componentOwnerOnly ?? "This interaction isn't for you.");
}

export function attachInteractionListener(options: {
	client: ClientClass;
	commands: Collection<string, SlashCommand>;
	ownerIds: Set<string>;
	cooldowns: CooldownStore;
	preconditionRegistry: Map<string, Precondition>;
	errorMessages?: InteractionErrorMessages;
	onError?: InteractionErrorCallback;
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
	const componentGenericError =
		errorMessages?.genericError ?? "Something went wrong.";
	const preconditionsFor = createPreconditionResolver(preconditionRegistry);

	async function handleAutocomplete(
		interaction: AutocompleteInteraction,
	): Promise<void> {
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
	}

	/**
	 * Shared routing logic for button, select menu, and modal interactions.
	 *
	 * Generic over T so each call site keeps its concrete interaction type,
	 * avoiding the contravariance errors that arise from a wide union handler type.
	 */
	async function handleComponent<
		T extends MessageComponentInteraction | ModalSubmitInteraction,
	>(
		interaction: T,
		label: string,
		getHandler: (
			cmd: SlashCommand,
			action: string,
		) => ComponentHandlerFn<T> | undefined,
	): Promise<void> {
		const parsed = parseCustomId(interaction.customId);
		if (!parsed.ok) return;

		const cmd = commands.get(parsed.commandName);
		if (!cmd) return;

		const handler = getHandler(cmd, parsed.action);
		if (!handler) return;

		const ownerError = checkComponentOwner(
			cmd,
			parsed.payload,
			interaction.user.id,
			errorMessages,
		);

		if (ownerError) {
			await replySafe(interaction, ownerError);
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
				await replySafe(interaction, err.message, err.ephemeral);
				return;
			}

			logger.error(
				`Error in ${label} handler for "${parsed.commandName}:${parsed.action}"`,
				err,
			);
			await replySafe(interaction, componentGenericError);
		}
	}

	async function handleChatInput(
		interaction: ChatInputCommandInteraction,
	): Promise<void> {
		const { commandName } = interaction;
		const command = commands.get(commandName);

		if (!command) {
			// Don't expose internal state to users — log it instead.
			logger.warn(`Received unknown slash command: "${commandName}"`);
			return;
		}

		// Built-ins enabled by meta + custom preconditions, resolved once per
		// command. Commands without any guards skip this entirely.
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

		const ctx = { interaction, client };

		if (hooks?.beforeExecute) {
			try {
				if ((await hooks.beforeExecute(ctx)) === false) return;
			} catch (err) {
				logger.error(`Error in beforeExecute hook for "${commandName}"`, err);
				return;
			}
		}

		try {
			let run = command.execute;

			if (command.subcommands) {
				const subName = interaction.options.getSubcommand(false);
				const groupName = interaction.options.getSubcommandGroup(false);
				const key = groupName ? `${groupName}/${subName}` : subName;
				const sub = key ? command.subcommands[key] : undefined;
				if (sub) run = sub;
			}

			await run(ctx);
		} catch (err) {
			if (isUserError(err)) {
				await replySafe(interaction, err.message, err.ephemeral);
				return;
			}

			logger.error(`Error executing "${commandName}"`, err);

			if (hooks?.onCommandError) {
				const onCommandError = hooks.onCommandError;
				await invokeSafely(`onCommandError hook for "${commandName}"`, () =>
					onCommandError(err, ctx),
				);
			}

			if (onError) {
				await invokeSafely(`onError callback for "${commandName}"`, () =>
					onError(err, { interaction, commandName }),
				);
			}

			// Only send the fallback if the command/hooks didn't already respond.
			if (!interaction.deferred && !interaction.replied) {
				await replySafe(interaction, genericError);
			}
			return;
		}

		// A failing afterExecute hook is not a command failure, so it must not
		// trigger the generic error reply.
		if (hooks?.afterExecute) {
			const afterExecute = hooks.afterExecute;
			await invokeSafely(`afterExecute hook for "${commandName}"`, () =>
				afterExecute(ctx),
			);
		}
	}

	async function dispatch(interaction: any): Promise<void> {
		if (interaction.isChatInputCommand()) return handleChatInput(interaction);
		if (interaction.isAutocomplete()) return handleAutocomplete(interaction);

		if (interaction.isButton()) {
			return handleComponent(interaction, "button", (cmd, action) =>
				cmd.buttons?.[action],
			);
		}

		if (interaction.isAnySelectMenu()) {
			return handleComponent(interaction, "select menu", (cmd, action) =>
				cmd.selectMenus?.[action],
			);
		}

		if (interaction.isModalSubmit()) {
			return handleComponent(interaction, "modal", (cmd, action) =>
				cmd.modals?.[action],
			);
		}
	}

	// Last line of defence: an error escaping an event listener becomes an
	// unhandled rejection, which terminates the process by default.
	const fn = async (interaction: any): Promise<void> => {
		try {
			await dispatch(interaction);
		} catch (err) {
			logger.error("Unhandled error while routing interaction", err);
		}
	};

	client.on("interactionCreate", fn);

	return {
		eventName: "interactionCreate",
		fn,
	};
}
