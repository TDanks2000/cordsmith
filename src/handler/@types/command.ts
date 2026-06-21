import type {
	AnySelectMenuInteraction,
	AutocompleteInteraction,
	ButtonInteraction,
	ChatInputCommandInteraction,
	ModalSubmitInteraction,
	PermissionsString,
} from "discord.js";
import type { ClientClass } from "../../structure/Client";

export type CommandMeta = {
	guildOnly?: boolean;
	dmOnly?: boolean;
	ownerOnly?: boolean;

	cooldownMs?: number;

	/**
	 * Whether the cooldown is scoped per-user (default), per-guild, or global.
	 * - "user"  — each user gets their own cooldown bucket (default)
	 * - "guild" — the whole guild shares one bucket
	 * - "global" — every invocation shares one bucket regardless of who or where
	 */
	cooldownScope?: "user" | "guild" | "global";

	userPermissions?: PermissionsString[];
	botPermissions?: PermissionsString[];

	defaultMemberPermissions?: PermissionsString[];

	componentOwnerOnly?: boolean;

	/**
	 * Names of additional preconditions to run before execute().
	 * Built-in preconditions (OwnerOnly, GuildOnly, Cooldown, UserPermissions,
	 * BotPermissions) are applied automatically from the meta fields above —
	 * you only need this for custom preconditions registered on CommandHandler.
	 *
	 * @example
	 * meta: { preconditions: ["HasRole:moderator", "PremiumOnly"] }
	 */
	preconditions?: string[];
};

export type SlashCommandData = {
	name: string;
	toJSON: () => unknown;
};

export type CommandContext<TInteraction, TClient = ClientClass> = {
	interaction: TInteraction;
	client: TClient;
};

export type ComponentHandler<TInteraction, TClient = ClientClass> = (ctx: {
	interaction: TInteraction;
	client: TClient;
	action: string;
	payload?: string;
}) => Promise<void>;

export type SlashCommand<TClient = ClientClass> = {
	data: SlashCommandData;
	meta?: CommandMeta;

	execute: (
		ctx: CommandContext<ChatInputCommandInteraction, TClient>,
	) => Promise<void>;

	subcommands?: Record<
		string,
		(ctx: CommandContext<ChatInputCommandInteraction, TClient>) => Promise<void>
	>;

	autocomplete?: (
		ctx: CommandContext<AutocompleteInteraction, TClient>,
	) => Promise<void>;

	buttons?: Record<string, ComponentHandler<ButtonInteraction, TClient>>;
	selectMenus?: Record<
		string,
		ComponentHandler<AnySelectMenuInteraction, TClient>
	>;
	modals?: Record<string, ComponentHandler<ModalSubmitInteraction, TClient>>;
};

export function defineSlashCommand<TClient = ClientClass>(
	cmd: SlashCommand<TClient>,
): SlashCommand<TClient> {
	return cmd;
}
