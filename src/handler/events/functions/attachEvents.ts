import { type ClientEvents, Events } from "discord.js";
import type { ClientClass } from "../../../structure/Client";
import { logger } from "../../../utils";
import type { LoadedEvents, LoadedListener } from "./loadEvents";

export type AttachedHandler = {
	eventName: keyof ClientEvents;
	once: boolean;
	fn: (...args: unknown[]) => void;
};

const KNOWN_EVENT_NAMES = new Set<string>(Object.values(Events));

async function runListeners<K extends keyof ClientEvents>(options: {
	client: ClientClass;
	eventName: K;
	listeners: LoadedListener[];
	args: ClientEvents[K];
}): Promise<void> {
	const { client, eventName, listeners, args } = options;

	for (const listener of listeners) {
		try {
			await listener.execute({ client, args });
		} catch (err) {
			logger.error(
				`Error in event "${String(eventName)}" listener (${listener.filePath})`,
				err,
			);
		}
	}
}

export function attachEvents(options: {
	client: ClientClass;
	events: LoadedEvents;
}): AttachedHandler[] {
	const { client, events } = options;

	const attached: AttachedHandler[] = [];

	for (const [eventName, listeners] of events) {
		if (!KNOWN_EVENT_NAMES.has(String(eventName))) {
			logger.warn(
				`Unknown event folder "${String(
					eventName,
				)}". Check spelling/casing. Files inside will still be attached, but may never fire.`,
			);
		}

		const onceListeners = listeners.filter((l) => l.once);
		const onListeners = listeners.filter((l) => !l.once);

		if (onListeners.length > 0) {
			const fn = (...args: unknown[]) => {
				void runListeners({
					client,
					eventName: eventName as never,
					listeners: onListeners,
					args: args as never,
				});
			};

			client.on(eventName, fn as never);
			attached.push({ eventName, once: false, fn });
		}

		if (onceListeners.length > 0) {
			const fn = (...args: unknown[]) => {
				void runListeners({
					client,
					eventName: eventName as never,
					listeners: onceListeners,
					args: args as never,
				});
			};

			client.once(eventName, fn as never);
			attached.push({ eventName, once: true, fn });
		}
	}

	return attached;
}

export function detachEvents(options: {
	client: ClientClass;
	attached: AttachedHandler[];
}): void {
	const { client, attached } = options;

	for (const h of attached) {
		client.off(h.eventName, h.fn as never);
	}
}
