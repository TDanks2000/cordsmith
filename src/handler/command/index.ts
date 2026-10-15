export type {
	Precondition,
	PreconditionContext,
	PreconditionResult,
} from "../@types/precondition";
export { defineSlashCommand } from "../@types/command";
export type {
	InteractionErrorCallback,
	InteractionErrorMessages,
	SlashCommandHooks,
} from "./functions/attachInteractionListener";
export type { CommandHandlerOptions } from "./CommandHandler";
export { CommandHandler } from "./CommandHandler";
export { CooldownStore, type CooldownScope } from "./functions/cooldowns";
export {
	DISCORD_CUSTOM_ID_MAX_LENGTH,
	makeCustomId,
	parseCustomId,
} from "./functions/customId";
// Built-in preconditions are exported so they can be composed or extended
// in custom preconditions.
export { BotPermissions } from "./functions/preconditions/BotPermissions";
export { Cooldown } from "./functions/preconditions/Cooldown";
export { DMOnly } from "./functions/preconditions/DMOnly";
export { GuildOnly } from "./functions/preconditions/GuildOnly";
export { OwnerOnly } from "./functions/preconditions/OwnerOnly";
export { UserPermissions } from "./functions/preconditions/UserPermissions";
export { loadCommandsFromDisk } from "./functions/loadCommands";
export type { RegisterMode } from "./functions/registerCommands";
export { isUserError, UserError } from "./functions/UserError";
