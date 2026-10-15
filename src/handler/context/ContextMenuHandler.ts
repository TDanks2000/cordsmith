import { Collection } from "discord.js";
import type { ClientClass } from "../../structure/Client";
import type { ContextMenuCommand } from "../@types/contextMenu";
import type { Precondition } from "../@types/precondition";
import { CooldownStore } from "../command/functions/cooldowns";
import { parseOwnerIds } from "../command/functions/owners";
import {
	type RegisterMode,
	registerCommands,
} from "../command/functions/registerCommands";
import { resolvePreconditions } from "../command/functions/runPreconditions";
import { serializeForRegistration } from "../utils/registration";
import {
	type AttachedContextMenuListener,
	attachContextMenuListener,
	type ContextMenuErrorCallback,
	type ContextMenuErrorMessages,
} from "./functions/attachContextMenuListener";
import { loadContextMenusFromDisk } from "./functions/loadContextMenus";

export type ContextMenuHandlerOptions = {
	client: ClientClass;

	contextMenusDir: string;

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
	 * Optionally pass CommandHandler's precondition registry to share
	 * custom preconditions across both handlers.
	 */
	preconditionRegistry?: Map<string, Precondition>;

	errorMessages?: ContextMenuErrorMessages;

	onError?: ContextMenuErrorCallback;
};

export class ContextMenuHandler {
	public readonly commands = new Collection<string, ContextMenuCommand>();

	private readonly client: ClientClass;
	private readonly contextMenusDir: string;
	private readonly registerConfig?: ContextMenuHandlerOptions["register"];
	private readonly extensions: string[];
	private readonly ownerIds: Set<string>;
	private readonly cooldowns = new CooldownStore();
	private readonly registrationCache: boolean;
	private readonly errorMessages: ContextMenuHandlerOptions["errorMessages"];
	private readonly onError: ContextMenuHandlerOptions["onError"];

	/**
	 * Shared precondition registry. If you pass the same Map instance used by
	 * CommandHandler, all registered preconditions are available to both
	 * slash commands and context menus automatically.
	 */
	private readonly preconditionRegistry: Map<string, Precondition>;
	private attachedListener?: AttachedContextMenuListener;

	private initialized = false;

	constructor(options: ContextMenuHandlerOptions) {
		this.client = options.client;
		this.contextMenusDir = options.contextMenusDir;
		this.registerConfig = options.register;
		this.extensions = options.extensions ?? [".ts"];
		this.preconditionRegistry =
			options.preconditionRegistry ?? new Map<string, Precondition>();

		this.ownerIds = options.ownerIds
			? new Set(options.ownerIds)
			: parseOwnerIds(Bun.env.DISCORD_OWNER_IDS);

		this.registrationCache = options.registrationCache ?? true;
		this.errorMessages = options.errorMessages;
		this.onError = options.onError;
	}

	/**
	 * Register a custom precondition so context menus can reference it by name.
	 * Must be called before `init()`. Returns `this` for chaining.
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
	 * Load context menus from disk.
	 * @internal Used by HandlerManager to load handlers concurrently.
	 */
	public async load(): Promise<void> {
		if (this.initialized) {
			throw new Error("ContextMenuHandler.init() was called more than once.");
		}
		this.initialized = true;

		const commands = await loadContextMenusFromDisk({
			contextMenusDir: this.contextMenusDir,
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

		// Fail fast on unregistered custom preconditions.
		for (const cmd of this.commands.values()) {
			resolvePreconditions({
				meta: cmd.meta,
				registry: this.preconditionRegistry,
				commandName: cmd.data.name,
			});
		}

		this.attachedListener = attachContextMenuListener({
			client: this.client,
			commands: this.commands,
			ownerIds: this.ownerIds,
			cooldowns: this.cooldowns,
			preconditionRegistry: this.preconditionRegistry,
			errorMessages: this.errorMessages,
			onError: this.onError,
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
	 * Serialise to plain JSON for Discord registration, sorted by name for a
	 * stable hash regardless of load order.
	 */
	public toRegistrationJson(): unknown[] {
		return serializeForRegistration(this.commands.values());
	}
}
