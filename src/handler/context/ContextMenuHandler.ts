import { Collection, PermissionsBitField } from "discord.js";
import type { ClientClass } from "../../structure/Client";
import type { ContextMenuCommand } from "../@types/contextMenu";
import type { Precondition } from "../@types/precondition";
import { CooldownStore } from "../command/functions/cooldowns";
import { parseOwnerIds } from "../command/functions/owners";
import {
	type RegisterMode,
	registerCommands,
} from "../command/functions/registerCommands";
import {
	type AttachedContextMenuListener,
	attachContextMenuListener,
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

	/**
	 * Shared precondition registry. If you pass the same Map instance used by
	 * CommandHandler, all registered preconditions are available to both
	 * slash commands and context menus automatically.
	 */
	private readonly preconditionRegistry: Map<string, Precondition>;
	private attachedListener?: AttachedContextMenuListener;

	private initialized = false;

	constructor(
		options: ContextMenuHandlerOptions & {
			/**
			 * Optionally pass CommandHandler's precondition registry to share
			 * custom preconditions across both handlers.
			 */
			preconditionRegistry?: Map<string, Precondition>;
		},
	) {
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

		this.attachedListener = attachContextMenuListener({
			client: this.client,
			commands: this.commands,
			ownerIds: this.ownerIds,
			cooldowns: this.cooldowns,
			preconditionRegistry: this.preconditionRegistry,
		});

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

	public detach(): void {
		if (!this.attachedListener) return;

		this.client.off(
			this.attachedListener.eventName,
			this.attachedListener.fn as never,
		);
		this.attachedListener = undefined;
	}

	/**
	 * Serialise to plain JSON for Discord registration.
	 * Permissions are applied to the JSON object, not the builder,
	 * so the in-memory store is never mutated as a side effect.
	 * Sorted by name for a stable hash regardless of load order.
	 */
	public toRegistrationJson(): unknown[] {
		const out: Array<Record<string, unknown>> = [];

		for (const cmd of this.commands.values()) {
			const json = cmd.data.toJSON() as unknown as Record<string, unknown>;

			const perms = cmd.meta?.defaultMemberPermissions;
			if (perms && perms.length > 0) {
				const bitfield = new PermissionsBitField(perms).bitfield;
				json.default_member_permissions = String(bitfield);
			}

			out.push(json);
		}

		return out.sort((a, b) =>
			String(a.name ?? "").localeCompare(String(b.name ?? "")),
		);
	}
}
