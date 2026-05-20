import type { ClientClass } from "../../structure/Client";
import { logger } from "../../utils";
import type { Precondition } from "../@types/precondition";
import {
	CommandHandler,
	type CommandHandlerOptions,
} from "../command/CommandHandler";
import {
	ContextMenuHandler,
	type ContextMenuHandlerOptions,
} from "../context/ContextMenuHandler";
import { EventHandler, type EventHandlerOptions } from "../events/EventHandler";
import { detachEvents } from "../events/functions/attachEvents";
import { TaskHandler, type TaskHandlerOptions } from "../tasks/TaskHandler";
import { registerCommands } from "../command/functions/registerCommands";
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
	 * Initialises all configured handlers in the correct order:
	 * 1. Events   — attach listeners first so nothing is missed
	 * 2. Commands — load slash commands and attach interaction routing
	 * 3. Context menus — load context menus and attach interaction routing
	 * 4. Registration — register all application commands in one payload per scope
	 * 5. Tasks    — start scheduled jobs last (bot should be ready)
	 */
	public async init(): Promise<void> {
		if (this.initialized) {
			throw new Error("HandlerManager.init() was called more than once.");
		}
		this.initialized = true;

		const { client } = this;

		logger.info("HandlerManager initialising...");
		const startedAt = Date.now();

		// 1. Events
		if (this.eventsConfig) {
			this.eventHandler = new EventHandler({
				...this.eventsConfig,
				client,
			});
			await this.eventHandler.init();
		}

		// 2. Commands
		if (this.commandsConfig) {
			this.commandHandler = new CommandHandler({
				...this.commandsConfig,
				client,
				register: undefined,
				preconditionRegistry: this.preconditions,
			});
			await this.commandHandler.init();
		}

		// 3. Context menus
		if (this.contextMenusConfig) {
			this.contextMenuHandler = new ContextMenuHandler({
				...this.contextMenusConfig,
				client,
				register: undefined,
				preconditionRegistry: this.preconditions,
			});
			await this.contextMenuHandler.init();
		}

		await this.registerApplicationCommands();

		// 4. Tasks
		if (this.tasksConfig) {
			this.taskHandler = new TaskHandler({
				...this.tasksConfig,
				client,
			});
			await this.taskHandler.init();
		}

		logger.info(`HandlerManager ready in ${Date.now() - startedAt}ms.`);

		if (this.shutdownSignals) {
			this.registerShutdownSignals();
		}
	}

	/**
	 * Gracefully tears down all handlers:
	 * - Cancels all scheduled tasks
	 * - Detaches all event listeners
	 *
	 * Safe to call multiple times.
	 */
	public shutdown(): void {
		logger.info("HandlerManager shutting down...");

		this.taskHandler?.cancelAll();
		this.commandHandler?.detach();
		this.contextMenuHandler?.detach();

		if (this.eventHandler) {
			detachEvents({
				client: this.client,
				attached: this.eventHandler.attachedHandlers,
			});
		}

		logger.info("HandlerManager shutdown complete.");
	}

	private registerShutdownSignals(): void {
		const handler = (signal: string) => {
			logger.info(`Received ${signal}. Shutting down...`);
			this.shutdown();
			process.exit(0);
		};

		process.once("SIGINT", () => handler("SIGINT"));
		process.once("SIGTERM", () => handler("SIGTERM"));
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

		for (const plan of combineRegistrationPlans(plans)) {
			await registerCommands({
				token: plan.register.token,
				applicationId: plan.register.applicationId,
				where: plan.register.where,
				commandJson: plan.commandJson,
				cache: plan.cache,
			});
		}
	}
}
