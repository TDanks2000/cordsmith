export type {
	Precondition,
	PreconditionContext,
	PreconditionResult,
} from "../@types/precondition";
export { defineSlashCommand } from "../@types/command";
export type {
	InteractionErrorMessages,
	SlashCommandHooks,
} from "./functions/attachInteractionListener";
export type { CommandHandlerOptions } from "./CommandHandler";
export { CommandHandler } from "./CommandHandler";
export {
	DISCORD_CUSTOM_ID_MAX_LENGTH,
	makeCustomId,
	parseCustomId,
} from "./functions/customId";
export { BotPermissions } from "./functions/preconditions/BotPermissions";
export { Cooldown } from "./functions/preconditions/Cooldown";
export { DMOnly } from "./functions/preconditions/DMOnly";
export { GuildOnly } from "./functions/preconditions/GuildOnly";
// if they want to compose or extend them in custom preconditions.
export { OwnerOnly } from "./functions/preconditions/OwnerOnly";
export { UserPermissions } from "./functions/preconditions/UserPermissions";
export { loadCommandsFromDisk } from "./functions/loadCommands";
export type { RegisterMode } from "./functions/registerCommands";
export { UserError } from "./functions/UserError";
