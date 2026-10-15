import type { ClientClass } from "../../structure/Client";
import type { AttachedHandler } from "./functions/attachEvents";
import { attachEvents, detachEvents } from "./functions/attachEvents";
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

	private loaded = false;

	constructor(options: EventHandlerOptions) {
		this.client = options.client;
		this.eventsDir = options.eventsDir;
		this.extensions = options.extensions ?? [".ts"];
	}

	public async init(): Promise<void> {
		await this.load();
		this.attach();
	}

	/**
	 * Load listener modules from disk without attaching them.
	 * @internal Used by HandlerManager to load handlers concurrently.
	 */
	public async load(): Promise<void> {
		if (this.loaded) {
			throw new Error("EventHandler.init() was called more than once.");
		}
		this.loaded = true;

		this.events = await loadEventsFromDisk({
			eventsDir: this.eventsDir,
			extensions: this.extensions,
		});
	}

	/**
	 * Attach loaded listeners to the client.
	 * @internal Used by HandlerManager to load handlers concurrently.
	 */
	public attach(): void {
		if (this.attachedHandlers.length > 0) return;

		this.attachedHandlers = attachEvents({
			client: this.client,
			events: this.events,
		});
	}

	/** Remove every listener this handler attached. Safe to call repeatedly. */
	public detach(): void {
		detachEvents({ client: this.client, attached: this.attachedHandlers });
		this.attachedHandlers = [];
	}
}
