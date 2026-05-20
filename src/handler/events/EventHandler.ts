import type { ClientClass } from "../../structure/Client";
import type { AttachedHandler } from "./functions/attachEvents";
import { attachEvents } from "./functions/attachEvents";
import { type LoadedEvents, loadEventsFromDisk } from "./functions/loadEvents";

export type EventHandlerOptions = {
	client: ClientClass;
	eventsDir: string;
	extensions?: string[];
};

export class EventHandler {
	private readonly client: ClientClass;
	private readonly eventsDir: string;
	private readonly extensions: string[];

	public events: LoadedEvents = new Map();
	public attachedHandlers: AttachedHandler[] = [];

	private initialized = false;

	constructor(options: EventHandlerOptions) {
		this.client = options.client;
		this.eventsDir = options.eventsDir;
		this.extensions = options.extensions ?? [".ts"];
	}

	public async init(): Promise<void> {
		if (this.initialized) {
			throw new Error("EventHandler.init() was called more than once.");
		}
		this.initialized = true;

		this.events = await loadEventsFromDisk({
			eventsDir: this.eventsDir,
			extensions: this.extensions,
		});

		// Store the return value so callers can detach listeners later via detachEvents()
		this.attachedHandlers = attachEvents({
			client: this.client,
			events: this.events,
		});
	}
}
