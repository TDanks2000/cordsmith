import path from "node:path";
import { logger } from "../../../utils";
import type { EventListenerModule, EventName } from "../../@types/event";
import { compareStrings, discoverModuleFiles } from "../../utils/files";
import { importModules } from "../../utils/modules";

export type LoadedListener = {
	filePath: string;
	once: boolean;
	order: number;
	execute: EventListenerModule["execute"];
};

export type LoadedEvents = Map<EventName, LoadedListener[]>;

function isListenerModule(mod: unknown): mod is EventListenerModule {
	if (!mod || typeof mod !== "object") return false;
	const m = mod as Partial<EventListenerModule>;
	return typeof m.execute === "function";
}

/**
 * Derive the event name from the file path.
 *
 * Normalises path separators before splitting so behaviour is consistent on
 * both POSIX and Windows (where path.sep would be "\\").
 *
 * Supported structures:
 *   <eventsDir>/<eventName>/[...].ts  — any number of listeners per event
 *   <eventsDir>/<eventName>.ts        — a single listener, named by the file
 */
function getEventNameFromFilePath(
	eventsDirAbs: string,
	filePath: string,
): string | null {
	const rel = path.relative(eventsDirAbs, filePath).replace(/\\/g, "/");
	const parts = rel.split("/").filter(Boolean);
	const first = parts[0];
	if (!first) return null;

	// A file directly in the root is named after the event: "ready.ts" → "ready"
	return parts.length === 1 ? first.replace(/\.[^.]+$/, "") : first;
}

export async function loadEventsFromDisk(options: {
	eventsDir: string;
	extensions: string[];
}): Promise<LoadedEvents> {
	const { rootDir, files } = await discoverModuleFiles({
		dir: options.eventsDir,
		extensions: options.extensions,
	});

	const events: LoadedEvents = new Map();
	let loaded = 0;

	for (const { filePath, mod } of await importModules(files)) {
		const eventName = getEventNameFromFilePath(rootDir, filePath) as
			| EventName
			| null;
		if (!eventName) continue;

		if (!isListenerModule(mod)) {
			logger.warn(`Skipping invalid event listener module: ${filePath}`);
			continue;
		}

		if (mod.enabled === false) continue;

		const listener: LoadedListener = {
			filePath,
			once: mod.once ?? false,
			order: mod.order ?? 0,
			execute: mod.execute,
		};

		const arr = events.get(eventName);
		if (arr) arr.push(listener);
		else events.set(eventName, [listener]);

		loaded += 1;
	}

	for (const listeners of events.values()) {
		listeners.sort(
			(a, b) => a.order - b.order || compareStrings(a.filePath, b.filePath),
		);
	}

	logger.info(`Loaded ${loaded} event listener file(s) from ${rootDir}`);

	return events;
}
