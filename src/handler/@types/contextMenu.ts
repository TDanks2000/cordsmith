import type {
	MessageContextMenuCommandInteraction,
	PermissionsString,
	UserContextMenuCommandInteraction,
} from "discord.js";
import type { ClientClass } from "../../structure/Client";

export type ContextMenuMeta = {
	guildOnly?: boolean;
	dmOnly?: boolean;
	ownerOnly?: boolean;
	cooldownMs?: number;
	cooldownScope?: "user" | "guild" | "global";
	userPermissions?: PermissionsString[];
	botPermissions?: PermissionsString[];
	defaultMemberPermissions?: PermissionsString[];

	/**
	 * Names of custom preconditions to run before execute().
	 */
	preconditions?: string[];
};

export type ContextMenuCommandData = {
	name: string;
	toJSON: () => unknown;
};

export type UserContextMenuCommand<TClient = ClientClass> = {
	type: "user";
	data: ContextMenuCommandData;
	meta?: ContextMenuMeta;
	execute: (ctx: {
		interaction: UserContextMenuCommandInteraction;
		client: TClient;
	}) => Promise<void>;
};

export type MessageContextMenuCommand<TClient = ClientClass> = {
	type: "message";
	data: ContextMenuCommandData;
	meta?: ContextMenuMeta;
	execute: (ctx: {
		interaction: MessageContextMenuCommandInteraction;
		client: TClient;
	}) => Promise<void>;
};

export type ContextMenuCommand<TClient = ClientClass> =
	| UserContextMenuCommand<TClient>
	| MessageContextMenuCommand<TClient>;

/**
 * Helper for type-safe user context menu command definitions.
 *
 * Usage:
 * export default defineUserContextMenu({
 *   data: new ContextMenuCommandBuilder().setName("Get Avatar"),
 *   async execute({ interaction, client }) {}
 * })
 */
export function defineUserContextMenu(
	cmd: Omit<UserContextMenuCommand, "type">,
): UserContextMenuCommand {
	return { ...cmd, type: "user" };
}

/**
 * Helper for type-safe message context menu command definitions.
 *
 * Usage:
 * export default defineMessageContextMenu({
 *   data: new ContextMenuCommandBuilder().setName("Translate"),
 *   async execute({ interaction, client }) {}
 * })
 */
export function defineMessageContextMenu(
	cmd: Omit<MessageContextMenuCommand, "type">,
): MessageContextMenuCommand {
	return { ...cmd, type: "message" };
}
