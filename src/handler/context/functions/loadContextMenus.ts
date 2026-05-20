import { pathToFileURL } from "node:url";
import { Collection } from "discord.js";
import { logger } from "../../../utils";
import type { ContextMenuCommand } from "../../@types/contextMenu";
import { discoverModuleFiles } from "../../utils/files";

export type LoadedContextMenus = Collection<string, ContextMenuCommand>;

function isContextMenuModule(mod: unknown): mod is ContextMenuCommand {
	if (!mod || typeof mod !== "object") return false;

	const m = mod as Partial<ContextMenuCommand>;

	return (
		typeof m.execute === "function" &&
		typeof m.data === "object" &&
		typeof m.data?.toJSON === "function" &&
		typeof (m.data as { name?: unknown }).name === "string" &&
		((m.data as { name?: unknown }).name as string).length > 0 &&
		(m.type === "user" || m.type === "message")
	);
}

export async function loadContextMenusFromDisk(options: {
	contextMenusDir: string;
	extensions: string[];
}): Promise<LoadedContextMenus> {
	const { rootDir, files } = await discoverModuleFiles({
		dir: options.contextMenusDir,
		extensions: options.extensions,
	});
	const commands = new Collection<string, ContextMenuCommand>();
	let loaded = 0;

	for (const filePath of files) {
		const fileUrl = pathToFileURL(filePath).href;
		const imported = await import(fileUrl);
		const cmd = imported.default;

		if (!isContextMenuModule(cmd)) {
			logger.warn(`Skipping invalid context menu module: ${filePath}`);
			continue;
		}

		const name = cmd.data.name;

		if (commands.has(name)) {
			throw new Error(
				`Duplicate context menu name "${name}" detected: ${filePath}`,
			);
		}

		commands.set(name, cmd);
		loaded += 1;
	}

	logger.info(`Loaded ${loaded} context menu command(s) from ${rootDir}`);
	return commands;
}
