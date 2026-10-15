import type { CommandMeta } from "../../@types/command";
import type { ContextMenuMeta } from "../../@types/contextMenu";
import type {
	Precondition,
	PreconditionContext,
} from "../../@types/precondition";
import { BotPermissions } from "./preconditions/BotPermissions";
import { Cooldown } from "./preconditions/Cooldown";
import { DMOnly } from "./preconditions/DMOnly";
import { GuildOnly } from "./preconditions/GuildOnly";
import { OwnerOnly } from "./preconditions/OwnerOnly";
import { UserPermissions } from "./preconditions/UserPermissions";

type Meta = CommandMeta | ContextMenuMeta;

/**
 * Built-in preconditions, each paired with the meta check that enables it.
 * Shared by slash commands and context menus. Order matters:
 *
 * 1. OwnerOnly     — bail early for non-owners before any other check
 * 2. GuildOnly     — bail before guild-specific checks (perms, cooldowns)
 * 3. DMOnly        — bail before guild-specific checks (perms, cooldowns)
 * 4. UserPermissions
 * 5. BotPermissions
 *
 * Cooldown is not listed here: it always runs last (after custom
 * preconditions) because it consumes the cooldown as a side effect, and a
 * user rejected by any other check should not be put on cooldown.
 */
const BUILT_INS: ReadonlyArray<[Precondition, (meta: Meta) => boolean]> = [
	[OwnerOnly, (m) => m.ownerOnly === true],
	[GuildOnly, (m) => m.guildOnly === true],
	[DMOnly, (m) => m.dmOnly === true],
	[UserPermissions, (m) => (m.userPermissions?.length ?? 0) > 0],
	[BotPermissions, (m) => (m.botPermissions?.length ?? 0) > 0],
];

/**
 * Build the ordered list of preconditions that apply to a command: built-ins
 * enabled by its meta, then its custom preconditions in declaration order,
 * then Cooldown. Throws if a custom precondition was never registered.
 */
export function resolvePreconditions(options: {
	meta: Meta | undefined;
	registry: ReadonlyMap<string, Precondition>;
	commandName: string;
}): Precondition[] {
	const { meta, registry, commandName } = options;
	if (!meta) return [];

	const chain: Precondition[] = [];

	for (const [precondition, applies] of BUILT_INS) {
		if (applies(meta)) chain.push(precondition);
	}

	for (const name of meta.preconditions ?? []) {
		const precondition = registry.get(name);

		if (!precondition) {
			throw new Error(
				`Precondition "${name}" is referenced by "${commandName}" but was never registered.`,
			);
		}

		chain.push(precondition);
	}

	if ((meta.cooldownMs ?? 0) > 0) chain.push(Cooldown);

	return chain;
}

/**
 * Returns a memoised resolver: each command's chain is computed once and
 * reused for every invocation instead of re-walking all built-ins each time.
 */
export function createPreconditionResolver(
	registry: ReadonlyMap<string, Precondition>,
): (cmd: { data: { name: string }; meta?: Meta }) => Precondition[] {
	const cache = new WeakMap<object, Precondition[]>();

	return (cmd) => {
		let chain = cache.get(cmd);

		if (!chain) {
			chain = resolvePreconditions({
				meta: cmd.meta,
				registry,
				commandName: cmd.data.name,
			});
			cache.set(cmd, chain);
		}

		return chain;
	};
}

export type PreconditionFailure = {
	message: string;
	ephemeral: boolean;
};

export type RunPreconditionsResult =
	| { ok: true }
	| { ok: false; failure: PreconditionFailure };

const OK: RunPreconditionsResult = { ok: true };

/**
 * Runs a resolved precondition chain, returning on the first failure.
 * Synchronous preconditions are not awaited, avoiding a microtask per check.
 */
export async function runPreconditions(
	chain: readonly Precondition[],
	ctx: PreconditionContext,
): Promise<RunPreconditionsResult> {
	for (const precondition of chain) {
		const pending = precondition.run(ctx);
		const result = pending instanceof Promise ? await pending : pending;

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

	return OK;
}
