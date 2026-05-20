import type { ClientEvents } from "discord.js";
import type { ClientClass } from "../../structure/Client";

export type EventName = keyof ClientEvents;

export type EventListenerModule<
	K extends EventName = EventName,
	TClient = ClientClass,
> = {
	once?: boolean;
	enabled?: boolean;
	order?: number;

	execute: (ctx: {
		client: TClient;
		args: ClientEvents[K];
	}) => Promise<void>;
};

/**
 * Helper for better type inference in event files.
 *
 * Usage:
 * export default defineEvent({
 *   name: "ready",
 *   once: true,
 *   async execute({ client }) {}
 * })
 *
 * Note: "name" is inferred from the folder, not required here; this helper
 * simply improves typing for args and ctx.
 */
export function defineEvent<K extends EventName>(
	mod: EventListenerModule<K>,
): EventListenerModule<K> {
	return mod;
}
