import type {
	Precondition,
	PreconditionContext,
	PreconditionResult,
} from "../../@types/precondition";
import { BotPermissions } from "./preconditions/BotPermissions";
import { Cooldown } from "./preconditions/Cooldown";
import { DMOnly } from "./preconditions/DMOnly";
import { GuildOnly } from "./preconditions/GuildOnly";
import { OwnerOnly } from "./preconditions/OwnerOnly";
import { UserPermissions } from "./preconditions/UserPermissions";

/**
 * Built-in preconditions applied to every slash command automatically,
 * based on the flags set in command meta. Order matters:
 *
 * 1. OwnerOnly     — bail early for non-owners before any other check
 * 2. GuildOnly     — bail before guild-specific checks (perms, cooldowns)
 * 3. DMOnly        — bail before guild-specific checks (perms, cooldowns)
 * 4. Cooldown      — check + set cooldown before executing
 * 5. UserPermissions
 * 6. BotPermissions
 */
const BUILT_INS: Precondition[] = [
	OwnerOnly,
	GuildOnly,
	DMOnly,
	Cooldown,
	UserPermissions,
	BotPermissions,
];

export type RunPreconditionsOptions = {
	ctx: PreconditionContext;
	/**
	 * Custom preconditions registered on CommandHandler, keyed by name.
	 * Only the ones listed in `ctx.meta.preconditions` will be run.
	 */
	registry: Map<string, Precondition>;
};

export type PreconditionFailure = {
	message: string;
	ephemeral: boolean;
};

export type RunPreconditionsResult =
	| { ok: true }
	| { ok: false; failure: PreconditionFailure };

/**
 * Runs all applicable preconditions for a slash command invocation.
 *
 * Built-ins always run first (in a fixed order) based on meta flags.
 * Custom preconditions from `meta.preconditions` run afterwards, in the
 * order they are declared on the command.
 *
 * Returns on the first failure — subsequent preconditions are not evaluated.
 */
export async function runPreconditions(
	options: RunPreconditionsOptions,
): Promise<RunPreconditionsResult> {
	const { ctx, registry } = options;

	// Run built-ins
	for (const precondition of BUILT_INS) {
		const result: PreconditionResult = await precondition.run(ctx);

		if (!result.ok) {
			return {
				ok: false,
				failure: {
					message: result.message,
					ephemeral: result.ephemeral ?? true,
				},
			};
		}
	}

	// Run custom preconditions declared on this command
	const customNames = ctx.meta.preconditions ?? [];

	for (const name of customNames) {
		const precondition = registry.get(name);

		if (!precondition) {
			throw new Error(
				`Precondition "${name}" is referenced by command "${ctx.interaction.commandName}" but was never registered on CommandHandler.`,
			);
		}

		const result: PreconditionResult = await precondition.run(ctx);

		if (!result.ok) {
			return {
				ok: false,
				failure: {
					message: result.message,
					ephemeral: result.ephemeral ?? true,
				},
			};
		}
	}

	return { ok: true };
}
