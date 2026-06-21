import { REST, Routes } from "discord.js";
import { logger } from "../../../utils/logger";
import {
	hashCommandJson,
	type RegisterScope,
	readCachedHash,
	writeCachedHash,
} from "./commandCache";

export type RegisterMode =
	| { mode: "guild"; guildId: string }
	| { mode: "guilds"; guildIds: string[] }
	| { mode: "global" }
	| { mode: "none" };

type RegistrationTarget = {
	scope: RegisterScope;
	label: string;
	route: `/${string}`;
	success: string;
};

export async function registerCommands(options: {
	token: string;
	applicationId: string;
	where: RegisterMode;
	commandJson: unknown[];
	/**
	 * If true, compare hashes and skip REST registration when unchanged.
	 * Defaults to true.
	 */
	cache?: boolean;

	/**
	 * If true, ALWAYS register regardless of cache.
	 * Defaults to Bun.env.DISCORD_FORCE_REGISTER === "true".
	 */
	force?: boolean;

	/**
	 * Optional cache partition key (ex: "development" / "production").
	 * If omitted, uses Bun.env.NODE_ENV (or undefined if not set).
	 */
	envKey?: string;
}): Promise<void> {
	const { token, applicationId, where, commandJson } = options;

	const useCache = options.cache ?? true;
	const force =
		options.force ??
		String(Bun.env.DISCORD_FORCE_REGISTER ?? "false").toLowerCase() === "true";

	const envKey = options.envKey ?? Bun.env.NODE_ENV;

	if (where.mode === "none") {
		logger.info("Skipping command registration (mode: none).");
		return;
	}

	// Single REST client instance shared across all registration paths below.
	const rest = new REST({ version: "10" }).setToken(token);

	const targets: RegistrationTarget[] =
		where.mode === "global"
			? [
					{
						scope: { mode: "global" },
						label: "global",
						route: Routes.applicationCommands(applicationId),
						success: `Registered ${commandJson.length} global application command(s). (Propagation can take time)`,
					},
				]
			: (where.mode === "guild" ? [where.guildId] : where.guildIds).map(
					(guildId) => ({
						scope: { mode: "guild", guildId },
						label: `guild ${guildId}`,
						route: Routes.applicationGuildCommands(
							applicationId,
							guildId,
						),
						success: `Registered ${commandJson.length} guild application command(s) to ${guildId}.`,
					}),
				);

	async function registerTarget(target: RegistrationTarget): Promise<void> {
		const nextHash = hashCommandJson(commandJson);

		if (useCache && !force) {
			const prevHash = await readCachedHash({
				scope: target.scope,
				applicationId,
				envKey,
			});

			if (prevHash && prevHash === nextHash) {
				logger.info(
					`Command registration skipped (no changes) for ${target.label}.`,
				);
				return;
			}

			logger.info(`Commands changed; registering for ${target.label}...`);
		} else if (force) {
			logger.warn(
				`Force register enabled; registering for ${target.label}...`,
			);
		} else {
			logger.info(
				`Registering for ${target.label} (cache disabled)...`,
			);
		}

		await rest.put(target.route, { body: commandJson });

		await writeCachedHash({
			scope: target.scope,
			applicationId,
			envKey,
			hash: nextHash,
		});

		logger.info(target.success);
	}

	if (where.mode !== "guilds") {
		await registerTarget(targets[0]!);
		return;
	}

	for (const target of targets) {
		try {
			await registerTarget(target);
		} catch (err) {
			logger.error(
				`Failed to register commands for ${target.label}; continuing.`,
				err,
			);
		}
	}
}
