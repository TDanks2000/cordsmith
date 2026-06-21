import type {
	Precondition,
	PreconditionContext,
	PreconditionResult,
} from "../../@types/precondition";
import { BotPermissions } from "../../command/functions/preconditions/BotPermissions";
import { Cooldown } from "../../command/functions/preconditions/Cooldown";
import { DMOnly } from "../../command/functions/preconditions/DMOnly";
import { GuildOnly } from "../../command/functions/preconditions/GuildOnly";
import { OwnerOnly } from "../../command/functions/preconditions/OwnerOnly";
import { UserPermissions } from "../../command/functions/preconditions/UserPermissions";

export type ContextMenuPreconditionContext = PreconditionContext;

export type ContextMenuPreconditionFailure = {
	message: string;
	ephemeral: boolean;
};

export type RunContextMenuPreconditionsResult =
	| { ok: true }
	| { ok: false; failure: ContextMenuPreconditionFailure };

/**
 * Built-in preconditions run for every context menu invocation.
 * Reuses the exact same objects as the slash command path so any fix
 * in a built-in applies automatically to both interaction types.
 */
const BUILT_INS: Precondition[] = [
	OwnerOnly,
	GuildOnly,
	DMOnly,
	Cooldown,
	UserPermissions,
	BotPermissions,
];

/**
 * Runs built-in guards and any custom preconditions for a context menu invocation.
 *
 * Previously this file reimplemented all built-in logic inline, meaning a bug
 * fix in e.g. Cooldown.ts would not apply here. Now it delegates to the shared
 * precondition objects directly.
 */
export async function runContextMenuPreconditions(options: {
	ctx: ContextMenuPreconditionContext;
	registry: Map<string, Precondition>;
}): Promise<RunContextMenuPreconditionsResult> {
	const { ctx, registry } = options;

	// Run built-ins first, in the same order as the slash command path
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

	// Run custom preconditions declared on this context menu command
	for (const name of ctx.meta.preconditions ?? []) {
		const precondition = registry.get(name);

		if (!precondition) {
			throw new Error(
				`Precondition "${name}" is referenced by context menu "${ctx.interaction.commandName}" but was never registered.`,
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
