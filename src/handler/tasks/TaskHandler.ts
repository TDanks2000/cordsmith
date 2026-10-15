import type { ClientClass } from "../../structure/Client";
import { logger } from "../../utils";
import type { LoadedTask } from "../@types/task";
import { loadTasksFromDisk } from "./functions/loadTasks";
import { scheduleTask, type TaskHandle } from "./functions/scheduleTask";

export type TaskHandlerOptions = {
	client: ClientClass;
	tasksDir: string;
	extensions?: string[];
};

export class TaskHandler {
	private readonly client: ClientClass;
	private readonly tasksDir: string;
	private readonly extensions: string[];

	public readonly tasks: LoadedTask[] = [];
	private readonly handles = new Map<string, TaskHandle>();

	private loaded = false;
	private started = false;

	constructor(options: TaskHandlerOptions) {
		this.client = options.client;
		this.tasksDir = options.tasksDir;
		this.extensions = options.extensions ?? [".ts"];
	}

	public async init(): Promise<void> {
		await this.load();
		this.start();
	}

	/**
	 * Load task modules from disk without scheduling them.
	 * @internal Used by HandlerManager to load handlers concurrently.
	 */
	public async load(): Promise<void> {
		if (this.loaded) {
			throw new Error("TaskHandler.init() was called more than once.");
		}
		this.loaded = true;

		const loaded = await loadTasksFromDisk({
			tasksDir: this.tasksDir,
			extensions: this.extensions,
		});

		this.tasks.push(...loaded);
	}

	/**
	 * Schedule every loaded task.
	 * @internal Used by HandlerManager to load handlers concurrently.
	 */
	public start(): void {
		if (this.started) return;
		this.started = true;

		for (const task of this.tasks) {
			this.handles.set(task.name, scheduleTask(task, { client: this.client }));
		}
	}

	/**
	 * Cancel all running tasks and clear their timers.
	 * Useful for graceful shutdown or hot-reload scenarios.
	 */
	public cancelAll(): void {
		if (this.handles.size === 0) return;

		for (const handle of this.handles.values()) {
			handle.cancel();
		}
		this.handles.clear();
		logger.info("All tasks cancelled.");
	}

	/**
	 * Cancel a single task by name.
	 * Returns true if found and cancelled, false otherwise.
	 */
	public cancel(name: string): boolean {
		const handle = this.handles.get(name);
		if (!handle) return false;

		handle.cancel();
		this.handles.delete(name);
		return true;
	}

	/**
	 * Run a scheduled task immediately, outside its schedule.
	 * Returns false if no active task has that name.
	 */
	public async run(name: string): Promise<boolean> {
		const handle = this.handles.get(name);
		if (!handle) return false;

		await handle.runNow();
		return true;
	}
}
