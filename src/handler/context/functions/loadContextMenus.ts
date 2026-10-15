import { Collection } from "discord.js";
import { logger } from "../../../utils";
import type { ContextMenuCommand } from "../../@types/contextMenu";
import { discoverModuleFiles } from "../../utils/files";
import { importModules } from "../../utils/modules";

export type LoadedContextMenus = Collection<string, ContextMenuCommand>;

function isContextMenuModule(mod: unknown): mod is ContextMenuCommand {
	if (!mod || typeof mod !== "object") return false;

	const m = mod as Partial<ContextMenuCommand>;
	const name = (m.data as { name?: unknown } | undefined)?.name;

	return (
		typeof m.execute === "function" &&
		typeof m.data?.toJSON === "function" &&
		typeof name === "string" &&
		name.length > 0 &&
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

	for (const { filePath, mod } of await importModules(files)) {
		if (!isContextMenuModule(mod)) {
			logger.warn(`Skipping invalid context menu module: ${filePath}`);
			continue;
		}

		const name = mod.data.name;

		if (commands.has(name)) {
			throw new Error(
				`Duplicate context menu name "${name}" detected: ${filePath}`,
			);
		}

		commands.set(name, mod);
	}

	logger.info(
		`Loaded ${commands.size} context menu command(s) from ${rootDir}`,
	);
	return commands;
}
