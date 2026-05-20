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
	| { mode: "global" }
	| { mode: "none" };

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

	const scope: RegisterScope =
		where.mode === "global"
			? { mode: "global" }
			: { mode: "guild", guildId: where.guildId };

	const scopeLabel =
		scope.mode === "global" ? "global" : `guild ${scope.guildId}`;

	// Single REST client instance shared across all registration paths below.
	const rest = new REST({ version: "10" }).setToken(token);

	if (useCache && !force) {
		const nextHash = hashCommandJson(commandJson);
		const prevHash = await readCachedHash({
			scope,
			applicationId,
			envKey,
		});

		if (prevHash && prevHash === nextHash) {
			logger.info(
				`Command registration skipped (no changes) for ${scopeLabel}.`,
			);
			return;
		}

		logger.info(`Commands changed; registering for ${scopeLabel}...`);

		if (where.mode === "guild") {
			await rest.put(
				Routes.applicationGuildCommands(applicationId, where.guildId),
				{ body: commandJson },
			);

			await writeCachedHash({ scope, applicationId, envKey, hash: nextHash });

			logger.info(
				`Registered ${commandJson.length} guild application command(s) to ${where.guildId}.`,
			);
			return;
		}

		await rest.put(Routes.applicationCommands(applicationId), {
			body: commandJson,
		});

		await writeCachedHash({ scope, applicationId, envKey, hash: nextHash });

		logger.info(
			`Registered ${commandJson.length} global application command(s). (Propagation can take time)`,
		);
		return;
	}

	// force=true intentionally bypasses the hash equality check and always
	// registers, even when commands are unchanged. We still write the hash
	// afterwards so the next normal startup can benefit from caching.
	if (force) {
		logger.warn(`Force register enabled; registering for ${scopeLabel}...`);
	} else {
		logger.info(`Registering for ${scopeLabel} (cache disabled)...`);
	}

	if (where.mode === "guild") {
		await rest.put(
			Routes.applicationGuildCommands(applicationId, where.guildId),
			{ body: commandJson },
		);

		const nextHash = hashCommandJson(commandJson);
		await writeCachedHash({ scope, applicationId, envKey, hash: nextHash });

		logger.info(
			`Registered ${commandJson.length} guild application command(s) to ${where.guildId}.`,
		);
		return;
	}

	await rest.put(Routes.applicationCommands(applicationId), {
		body: commandJson,
	});

	const nextHash = hashCommandJson(commandJson);
	await writeCachedHash({ scope, applicationId, envKey, hash: nextHash });

	logger.info(
		`Registered ${commandJson.length} global application command(s). (Propagation can take time)`,
	);
}
