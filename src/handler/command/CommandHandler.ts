import { Collection } from "discord.js";
import type { ClientClass } from "../../structure/Client";
import type { SlashCommand } from "../@types/command";
import type { Precondition } from "../@types/precondition";
import { serializeForRegistration } from "../utils/registration";
import {
	type AttachedInteractionListener,
	attachInteractionListener,
	type InteractionErrorCallback,
	type InteractionErrorMessages,
	type SlashCommandHooks,
} from "./functions/attachInteractionListener";
import { CooldownStore } from "./functions/cooldowns";
import { loadCommandsFromDisk } from "./functions/loadCommands";
import { parseOwnerIds } from "./functions/owners";
import {
	type RegisterMode,
	registerCommands,
} from "./functions/registerCommands";
import { resolvePreconditions } from "./functions/runPreconditions";

export type CommandHandlerOptions = {
	client: ClientClass;

	commandsDir: string;

	register?: {
		token: string;
		applicationId: string;
		where: RegisterMode;
	};

	extensions?: string[];

	ownerIds?: string[];

	/**
	 * If true (default), skip REST registration when commands haven't changed.
	 */
	registrationCache?: boolean;

	/**
	 * Optionally provide an external precondition registry (e.g. from
	 * HandlerManager) so preconditions are shared across multiple handlers.
	 * If omitted, a fresh registry is created for this handler only.
	 */
	preconditionRegistry?: Map<string, Precondition>;

	errorMessages?: InteractionErrorMessages;

	onError?: InteractionErrorCallback;

	hooks?: SlashCommandHooks;
};

export class CommandHandler {
	public readonly commands = new Collection<string, SlashCommand>();

	private readonly client: ClientClass;
	private readonly commandsDir: string;
	private readonly registerConfig?: CommandHandlerOptions["register"];
	private readonly extensions: string[];
	private readonly ownerIds: Set<string>;
	private readonly cooldowns = new CooldownStore();
	private readonly registrationCache: boolean;
	private readonly errorMessages: CommandHandlerOptions["errorMessages"];
	private readonly onError: CommandHandlerOptions["onError"];
	private readonly hooks: CommandHandlerOptions["hooks"];

	/**
	 * Registry of custom preconditions, keyed by name.
	 * Built-ins (OwnerOnly, GuildOnly, Cooldown, UserPermissions, BotPermissions)
	 * are applied automatically and do not need to be registered here.
	 */
	private readonly preconditionRegistry: Map<string, Precondition>;
	private attachedListener?: AttachedInteractionListener;

	private initialized = false;

	constructor(options: CommandHandlerOptions) {
		this.client = options.client;
		this.commandsDir = options.commandsDir;
		this.registerConfig = options.register;
		this.extensions = options.extensions ?? [".ts"];

		this.ownerIds = options.ownerIds
			? new Set(options.ownerIds)
			: parseOwnerIds(Bun.env.DISCORD_OWNER_IDS);

		this.registrationCache = options.registrationCache ?? true;
		this.errorMessages = options.errorMessages;
		this.onError = options.onError;
		this.hooks = options.hooks;

		// Use a shared registry if provided (e.g. from HandlerManager),
		// otherwise create a fresh one scoped to this handler.
		this.preconditionRegistry =
			options.preconditionRegistry ?? new Map<string, Precondition>();
	}

	/**
	 * Register a custom precondition so commands can reference it by name
	 * in their `meta.preconditions` array.
	 *
	 * Must be called before `init()`.
	 *
	 * Returns `this` for chaining:
	 * ```ts
	 * handler
	 *   .registerPrecondition(PremiumOnly)
	 *   .registerPrecondition(HasRole)
	 *   .init();
	 * ```
	 */
	public registerPrecondition(precondition: Precondition): this {
		if (this.initialized) {
			throw new Error(
				`Cannot register precondition "${precondition.name}" after init() has been called.`,
			);
		}

		if (this.preconditionRegistry.has(precondition.name)) {
			throw new Error(
				`Precondition "${precondition.name}" is already registered.`,
			);
		}

		this.preconditionRegistry.set(precondition.name, precondition);
		return this;
	}

	public async init(): Promise<void> {
		await this.load();
		this.attach();

		if (this.registerConfig) {
			await registerCommands({
				token: this.registerConfig.token,
				applicationId: this.registerConfig.applicationId,
				where: this.registerConfig.where,
				commandJson: this.toRegistrationJson(),
				cache: this.registrationCache,
			});
		}
	}

	/**
	 * Load commands from disk and validate their preconditions.
	 * @internal Used by HandlerManager to load handlers concurrently.
	 */
	public async load(): Promise<void> {
		if (this.initialized) {
			throw new Error("CommandHandler.init() was called more than once.");
		}
		this.initialized = true;

		const { commands } = await loadCommandsFromDisk({
			commandsDir: this.commandsDir,
			extensions: this.extensions,
		});

		for (const [name, cmd] of commands) {
			this.commands.set(name, cmd);
		}
	}

	/**
	 * Attach the interaction listener to the client.
	 * @internal Used by HandlerManager to load handlers concurrently.
	 */
	public attach(): void {
		if (this.attachedListener) return;

		// Fail fast on unregistered custom preconditions at startup rather than
		// on the first invocation of the offending command.
		for (const cmd of this.commands.values()) {
			resolvePreconditions({
				meta: cmd.meta,
				registry: this.preconditionRegistry,
				commandName: cmd.data.name,
			});
		}

		this.attachedListener = attachInteractionListener({
			client: this.client,
			commands: this.commands,
			ownerIds: this.ownerIds,
			cooldowns: this.cooldowns,
			preconditionRegistry: this.preconditionRegistry,
			errorMessages: this.errorMessages,
			onError: this.onError,
			hooks: this.hooks,
		});
	}

	public detach(): void {
		if (!this.attachedListener) return;

		this.client.off(
			this.attachedListener.eventName,
			this.attachedListener.fn as never,
		);
		this.attachedListener = undefined;
	}

	/**
	 * Serialise commands to plain JSON for Discord registration, sorted by name
	 * so the registration hash is stable regardless of load order.
	 */
	public toRegistrationJson(): unknown[] {
		return serializeForRegistration(this.commands.values());
	}
}
