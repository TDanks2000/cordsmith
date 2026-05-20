import { pathToFileURL } from "node:url";
import { Collection } from "discord.js";
import { logger } from "../../../utils";
import type { SlashCommand } from "../../@types/command";
import { discoverModuleFiles } from "../../utils/files";

type LoadResult = {
	commands: Collection<string, SlashCommand>;
};

function isSlashCommandModule(mod: unknown): mod is SlashCommand {
	if (!mod || typeof mod !== "object") return false;

	const m = mod as Partial<SlashCommand>;
	return (
		typeof m.execute === "function" &&
		typeof m.data === "object" &&
		typeof m.data?.toJSON === "function" &&
		// Ensure data.name is present and non-empty so we never register a
		// command under "undefined" or produce a confusing duplicate-name error
		typeof (m.data as { name?: unknown }).name === "string" &&
		((m.data as { name?: unknown }).name as string).length > 0
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
	let loaded = 0;

	for (const filePath of files) {
		const fileUrl = pathToFileURL(filePath).href;
		const imported = await import(fileUrl);
		const cmd = imported.default;

		if (!isSlashCommandModule(cmd)) {
			logger.warn(`Skipping invalid command module: ${filePath}`);
			continue;
		}

		const name = cmd.data.name;

		if (commands.has(name)) {
			throw new Error(
				`Duplicate command name "${name}" detected: ${filePath}`,
			);
		}

		commands.set(name, cmd);
		loaded += 1;
	}

	logger.info(`Loaded ${loaded} slash command(s) from ${rootDir}`);
	return { commands };
}
