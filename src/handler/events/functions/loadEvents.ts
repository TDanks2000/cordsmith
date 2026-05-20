import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger } from "../../../utils";
import type { EventListenerModule, EventName } from "../../@types/event";
import { discoverModuleFiles } from "../../utils/files";

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
 * Expected structure: <eventsDir>/<eventName>/[...].ts
 */
function getEventNameFromFilePath(
	eventsDirAbs: string,
	filePath: string,
): string | null {
	const rel = path.relative(eventsDirAbs, filePath).replace(/\\/g, "/"); // normalise Windows backslashes

	const parts = rel.split("/").filter(Boolean);
	return parts[0] ?? null;
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

	for (const filePath of files) {
		const eventNameRaw = getEventNameFromFilePath(rootDir, filePath);
		if (!eventNameRaw) continue;

		const fileUrl = pathToFileURL(filePath).href;
		const imported = await import(fileUrl);
		const mod = imported.default;

		if (!isListenerModule(mod)) {
			logger.warn(`Skipping invalid event listener module: ${filePath}`);
			continue;
		}

		if (mod.enabled === false) continue;

		const eventName = eventNameRaw as EventName;

		const listener: LoadedListener = {
			filePath,
			once: mod.once ?? false,
			order: mod.order ?? 0,
			execute: mod.execute,
		};

		const arr = events.get(eventName) ?? [];
		arr.push(listener);
		events.set(eventName, arr);

		loaded += 1;
	}

	for (const [eventName, listeners] of events) {
		listeners.sort((a, b) => {
			if (a.order !== b.order) return a.order - b.order;
			return a.filePath.localeCompare(b.filePath);
		});
		events.set(eventName, listeners);
	}

	logger.info(`Loaded ${loaded} event listener file(s) from ${rootDir}`);

	return events;
}
