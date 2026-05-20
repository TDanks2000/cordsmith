import { Collection, PermissionsBitField } from "discord.js";
import type { ClientClass } from "../../structure/Client";
import type { SlashCommand } from "../@types/command";
import type { Precondition } from "../@types/precondition";
import {
	type AttachedInteractionListener,
	attachInteractionListener,
} from "./functions/attachInteractionListener";
import { CooldownStore } from "./functions/cooldowns";
import { loadCommandsFromDisk } from "./functions/loadCommands";
import { parseOwnerIds } from "./functions/owners";
import {
	type RegisterMode,
	registerCommands,
} from "./functions/registerCommands";

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

		this.attachedListener = attachInteractionListener({
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
	 * Serialise commands to plain JSON for Discord registration.
	 *
	 * Permissions are applied to the serialised JSON object rather than the
	 * builder so we never mutate the in-memory command store as a side effect.
	 *
	 * Commands are sorted by name before serialisation so the hash is stable
	 * regardless of the order files are discovered on disk — without this, adding
	 * a command that glob-sorts before an existing one changes the array order,
	 * which changes the hash and can cause spurious re-registrations or missed
	 * registrations depending on the cache state.
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

		// Sort by name for a stable hash across different load orders
		return out.sort((a, b) =>
			String(a.name ?? "").localeCompare(String(b.name ?? "")),
		);
	}
}
