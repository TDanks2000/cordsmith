import type { ChatInputCommandInteraction } from "discord.js";
import type { ClientClass } from "../../structure/Client";
import type { CooldownStore } from "../command/functions/cooldowns";
import type { CommandMeta } from "./command";

export type PreconditionResult =
	| { ok: true }
	| { ok: false; message: string; ephemeral?: boolean };

export type PreconditionContext = {
	interaction: ChatInputCommandInteraction;
	client: ClientClass;
	meta: CommandMeta;
	ownerIds: Set<string>;
	cooldowns: CooldownStore;
};

export type Precondition = {
	/**
	 * Unique name used to reference this precondition in command meta.
	 * e.g. "GuildOnly", "HasRole:moderator"
	 */
	readonly name: string;

	run: (
		ctx: PreconditionContext,
	) => Promise<PreconditionResult> | PreconditionResult;
};
