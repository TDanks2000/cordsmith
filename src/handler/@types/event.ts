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
 * // events/clientReady/announce.ts  (or events/clientReady.ts)
 * export default defineEvent<"clientReady">({
 *   once: true,
 *   async execute({ client, args: [readyClient] }) {}
 * })
 *
 * Note: the event name is inferred from the folder (or file) name; pass it as
 * the type parameter to get typed `args`.
 */
export function defineEvent<K extends EventName, TClient = ClientClass>(
	mod: EventListenerModule<K, TClient>,
): EventListenerModule<K, TClient> {
	return mod;
}
