import path from "node:path";
import { logger } from "../../../utils";
import type { LoadedTask, TaskModule } from "../../@types/task";
import { discoverModuleFiles } from "../../utils/files";
import { importModules } from "../../utils/modules";
import { parseCron } from "./parseCron";

function isTaskModule(mod: unknown): mod is TaskModule {
	if (!mod || typeof mod !== "object") return false;

	const m = mod as Partial<TaskModule>;

	if (typeof m.execute !== "function") return false;

	const hasInterval = typeof m.intervalMs === "number" && m.intervalMs > 0;
	const hasCron = typeof m.cron === "string" && m.cron.trim().length > 0;

	// Must have exactly one scheduling strategy
	return hasInterval !== hasCron;
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
	const names = new Set<string>();

	for (const { filePath, mod } of await importModules(files)) {
		if (!isTaskModule(mod)) {
			logger.warn(`Skipping invalid task module: ${filePath}`);
			continue;
		}

		if (mod.enabled === false) continue;

		const name = mod.name ?? nameFromFilePath(rootDir, filePath);

		// Duplicate names would make TaskHandler.cancel(name) ambiguous.
		if (names.has(name)) {
			throw new Error(`Duplicate task name "${name}" detected: ${filePath}`);
		}

		// Validate cron expressions at load time so a typo fails fast with the
		// offending file in the message, before any task has been scheduled.
		if (mod.cron) {
			try {
				parseCron(mod.cron);
			} catch (cause) {
				throw new Error(`Invalid cron for task "${name}" (${filePath})`, {
					cause,
				});
			}
		}

		names.add(name);
		tasks.push({
			name,
			filePath,
			intervalMs: mod.intervalMs,
			cron: mod.cron,
			runOnStart: mod.runOnStart ?? false,
			retry: mod.retry,
			execute: mod.execute,
		});
	}

	logger.info(`Loaded ${tasks.length} task(s) from ${rootDir}`);
	return tasks;
}
