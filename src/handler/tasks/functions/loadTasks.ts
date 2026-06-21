import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "../../../utils";
import type { LoadedTask, TaskModule } from "../../@types/task";
import { discoverModuleFiles } from "../../utils/files";

function isTaskModule(mod: unknown): mod is TaskModule {
	if (!mod || typeof mod !== "object") return false;

	const m = mod as Partial<TaskModule>;

	if (typeof m.execute !== "function") return false;

	const hasInterval = typeof m.intervalMs === "number" && m.intervalMs > 0;
	const hasCron = typeof m.cron === "string" && m.cron.trim().length > 0;

	// Must have exactly one scheduling strategy
	if (!hasInterval && !hasCron) return false;
	if (hasInterval && hasCron) return false;

	return true;
}

function nameFromFilePath(tasksDir: string, filePath: string): string {
	const rel = path.relative(tasksDir, filePath).replace(/\\/g, "/");
	// Strip extension: "cleanup/oldMessages.ts" → "cleanup/oldMessages"
	return rel.replace(/\.[^/.]+$/, "");
}

export async function loadTasksFromDisk(options: {
	tasksDir: string;
	extensions: string[];
}): Promise<LoadedTask[]> {
	const { rootDir, files } = await discoverModuleFiles({
		dir: options.tasksDir,
		extensions: options.extensions,
	});
	const tasks: LoadedTask[] = [];
	let loaded = 0;

	for (const filePath of files) {
		const fileUrl = pathToFileURL(filePath).href;
		const imported = await import(fileUrl);
		const mod = imported.default;

		if (!isTaskModule(mod)) {
			logger.warn(`Skipping invalid task module: ${filePath}`);
			continue;
		}

		if (mod.enabled === false) continue;

		const name = mod.name ?? nameFromFilePath(rootDir, filePath);

		// Bug fix: duplicate names caused TaskHandler.cancel(name) to only
		// ever find the first match, leaving the second task running silently.
		if (tasks.some((t) => t.name === name)) {
			throw new Error(`Duplicate task name "${name}" detected: ${filePath}`);
		}

		tasks.push({
			name,
			filePath,
			intervalMs: mod.intervalMs,
			cron: mod.cron,
			runOnStart: mod.runOnStart ?? false,
			retry: mod.retry,
			execute: mod.execute,
		});

		loaded += 1;
	}

	logger.info(`Loaded ${loaded} task(s) from ${rootDir}`);
	return tasks;
}
