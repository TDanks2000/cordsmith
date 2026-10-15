import type { ClientClass } from "../../structure/Client";
import { logger } from "../../utils";
import type { Precondition } from "../@types/precondition";
import {
	CommandHandler,
	type CommandHandlerOptions,
} from "../command/CommandHandler";
import { registerCommands } from "../command/functions/registerCommands";
import {
	ContextMenuHandler,
	type ContextMenuHandlerOptions,
} from "../context/ContextMenuHandler";
import { EventHandler, type EventHandlerOptions } from "../events/EventHandler";
import { TaskHandler, type TaskHandlerOptions } from "../tasks/TaskHandler";
import {
	combineRegistrationPlans,
	type HandlerRegistrationPlan,
} from "./registrationPlans";

// Options for each handler are the same as their standalone versions,
// minus `client` which is provided once at the top level.
type WithoutClient<T> = Omit<T, "client">;

export type HandlerManagerOptions = {
	client: ClientClass;

	commands?: WithoutClient<CommandHandlerOptions>;
	contextMenus?: WithoutClient<ContextMenuHandlerOptions>;
	events?: WithoutClient<EventHandlerOptions>;
	tasks?: WithoutClient<TaskHandlerOptions>;

	/**
	 * If true (default), registers SIGINT and SIGTERM handlers for graceful
	 * shutdown. Set to false if you manage process signals yourself.
	 */
	handleShutdownSignals?: boolean;
};

export class HandlerManager {
	private readonly client: ClientClass;
	private readonly commandsConfig?: WithoutClient<CommandHandlerOptions>;
	private readonly contextMenusConfig?: WithoutClient<ContextMenuHandlerOptions>;
	private readonly eventsConfig?: WithoutClient<EventHandlerOptions>;
	private readonly tasksConfig?: WithoutClient<TaskHandlerOptions>;
	private readonly shutdownSignals: boolean;

	/**
	 * Shared precondition registry passed to both CommandHandler and
	 * ContextMenuHandler. Register preconditions here once and they are
	 * available to both slash commands and context menus.
	 */
	public readonly preconditions = new Map<string, Precondition>();

	public commandHandler?: CommandHandler;
	public contextMenuHandler?: ContextMenuHandler;
	public eventHandler?: EventHandler;
	public taskHandler?: TaskHandler;

	private initialized = false;
	private isShutDown = false;
	private signalListeners: Array<[NodeJS.Signals, () => void]> = [];

	constructor(options: HandlerManagerOptions) {
		this.client = options.client;
		this.commandsConfig = options.commands;
		this.contextMenusConfig = options.contextMenus;
		this.eventsConfig = options.events;
		this.tasksConfig = options.tasks;
		this.shutdownSignals = options.handleShutdownSignals !== false;
	}

	/**
	 * Register a custom precondition. Must be called before `init()`.
	 * Available to both slash commands and context menus automatically.
	 * Returns `this` for chaining.
	 */
	public registerPrecondition(precondition: Precondition): this {
		if (this.initialized) {
			throw new Error(
				`Cannot register precondition "${precondition.name}" after init() has been called.`,
			);
		}

		if (this.preconditions.has(precondition.name)) {
			throw new Error(
				`Precondition "${precondition.name}" is already registered.`,
			);
		}

		this.preconditions.set(precondition.name, precondition);
		return this;
	}

	/**
	 * Initialises all configured handlers:
	 * 1. Load    — every handler's modules are imported concurrently
	 * 2. Attach  — events first, then commands, then context menus, so
	 *              listener order is deterministic regardless of load timing
	 * 3. Register — all application commands in one payload per scope
	 * 4. Tasks   — start scheduled jobs last
	 */
	public async init(): Promise<void> {
		if (this.initialized) {
			throw new Error("HandlerManager.init() was called more than once.");
		}
		this.initialized = true;

		const { client } = this;

		logger.info("HandlerManager initialising...");
		const startedAt = performance.now();

		if (this.eventsConfig) {
			this.eventHandler = new EventHandler({ ...this.eventsConfig, client });
		}

		if (this.commandsConfig) {
			this.commandHandler = new CommandHandler({
				...this.commandsConfig,
				client,
				register: undefined,
				preconditionRegistry: this.preconditions,
			});
		}

		if (this.contextMenusConfig) {
			this.contextMenuHandler = new ContextMenuHandler({
				...this.contextMenusConfig,
				client,
				register: undefined,
				preconditionRegistry: this.preconditions,
			});
		}

		if (this.tasksConfig) {
			this.taskHandler = new TaskHandler({ ...this.tasksConfig, client });
		}

		// 1. Load everything concurrently — module import is the slowest part
		//    of startup and the handlers don't depend on each other.
		await Promise.all([
			this.eventHandler?.load(),
			this.commandHandler?.load(),
			this.contextMenuHandler?.load(),
			this.taskHandler?.load(),
		]);

		// 2. Attach in a fixed order
		this.eventHandler?.attach();
		this.commandHandler?.attach();
		this.contextMenuHandler?.attach();

		// 3. Register application commands
		await this.registerApplicationCommands();

		// 4. Tasks
		this.taskHandler?.start();

		logger.info(
			`HandlerManager ready in ${Math.round(performance.now() - startedAt)}ms.`,
		);

		if (this.shutdownSignals) {
			this.registerShutdownSignals();
		}
	}

	/**
	 * Gracefully tears down all handlers:
	 * - Cancels all scheduled tasks
	 * - Detaches all interaction and event listeners
	 * - Removes the signal handlers registered by init()
	 *
	 * Safe to call multiple times.
	 */
	public shutdown(): void {
		if (this.isShutDown) return;
		this.isShutDown = true;

		logger.info("HandlerManager shutting down...");

		this.taskHandler?.cancelAll();
		this.commandHandler?.detach();
		this.contextMenuHandler?.detach();
		this.eventHandler?.detach();

		for (const [signal, listener] of this.signalListeners) {
			process.off(signal, listener);
		}
		this.signalListeners = [];

		logger.info("HandlerManager shutdown complete.");
	}

	private registerShutdownSignals(): void {
		for (const signal of ["SIGINT", "SIGTERM"] as const) {
			const listener = () => {
				logger.info(`Received ${signal}. Shutting down...`);
				this.shutdown();

				// Close the gateway connection cleanly if the client supports it
				// (discord.js Client does), then exit.
				Promise.resolve()
					.then(() => this.client.destroy?.())
					.catch((err) => logger.error("Error destroying client", err))
					.finally(() => process.exit(0));
			};

			process.once(signal, listener);
			this.signalListeners.push([signal, listener]);
		}
	}

	private async registerApplicationCommands(): Promise<void> {
		const plans: HandlerRegistrationPlan[] = [];

		if (this.commandsConfig?.register && this.commandHandler) {
			plans.push({
				register: this.commandsConfig.register,
				commandJson: this.commandHandler.toRegistrationJson(),
				cache: this.commandsConfig.registrationCache ?? true,
			});
		}

		if (this.contextMenusConfig?.register && this.contextMenuHandler) {
			plans.push({
				register: this.contextMenusConfig.register,
				commandJson: this.contextMenuHandler.toRegistrationJson(),
				cache: this.contextMenusConfig.registrationCache ?? true,
			});
		}

		// Different scopes are independent, so register them concurrently.
		await Promise.all(
			combineRegistrationPlans(plans).map((plan) =>
				registerCommands({
					token: plan.register.token,
					applicationId: plan.register.applicationId,
					where: plan.register.where,
					commandJson: plan.commandJson,
					cache: plan.cache,
				}),
			),
		);
	}
}
