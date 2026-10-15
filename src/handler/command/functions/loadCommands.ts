import { Collection } from "discord.js";
import { logger } from "../../../utils";
import type { SlashCommand } from "../../@types/command";
import { discoverModuleFiles } from "../../utils/files";
import { importModules } from "../../utils/modules";

type LoadResult = {
	commands: Collection<string, SlashCommand>;
};

function isSlashCommandModule(mod: unknown): mod is SlashCommand {
	if (!mod || typeof mod !== "object") return false;

	const m = mod as Partial<SlashCommand>;
	const name = (m.data as { name?: unknown } | undefined)?.name;

	return (
		typeof m.execute === "function" &&
		typeof m.data?.toJSON === "function" &&
		// Ensure data.name is present and non-empty so we never register a
		// command under "undefined" or produce a confusing duplicate-name error
		typeof name === "string" &&
		name.length > 0
	);
}

export async function loadCommandsFromDisk(options: {
	commandsDir: string;
	extensions: string[];
}): Promise<LoadResult> {
	const { rootDir, files } = await discoverModuleFiles({
		dir: options.commandsDir,
		extensions: options.extensions,
	});

	const commands = new Collection<string, SlashCommand>();

	for (const { filePath, mod } of await importModules(files)) {
		if (!isSlashCommandModule(mod)) {
			logger.warn(`Skipping invalid command module: ${filePath}`);
			continue;
		}

		const name = mod.data.name;

		if (commands.has(name)) {
			throw new Error(
				`Duplicate command name "${name}" detected: ${filePath}`,
			);
		}

		commands.set(name, mod);
	}

	logger.info(`Loaded ${commands.size} slash command(s) from ${rootDir}`);
	return { commands };
}
