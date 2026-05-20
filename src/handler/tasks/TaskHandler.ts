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
	private readonly handles: TaskHandle[] = [];

	private initialized = false;

	constructor(options: TaskHandlerOptions) {
		this.client = options.client;
		this.tasksDir = options.tasksDir;
		this.extensions = options.extensions ?? [".ts"];
	}

	public async init(): Promise<void> {
		if (this.initialized) {
			throw new Error("TaskHandler.init() was called more than once.");
		}
		this.initialized = true;

		const loaded = await loadTasksFromDisk({
			tasksDir: this.tasksDir,
			extensions: this.extensions,
		});

		for (const task of loaded) {
			this.tasks.push(task);

			const handle = scheduleTask(task, { client: this.client });
			this.handles.push(handle);
		}
	}

	/**
	 * Cancel all running tasks and clear their timers.
	 * Useful for graceful shutdown or hot-reload scenarios.
	 */
	public cancelAll(): void {
		for (const handle of this.handles) {
			handle.cancel();
		}
		this.handles.length = 0;
		logger.info("All tasks cancelled.");
	}

	/**
	 * Cancel a single task by name.
	 * Returns true if found and cancelled, false otherwise.
	 */
	public cancel(name: string): boolean {
		const handle = this.handles.find((h) => h.name === name);

		if (!handle) return false;

		handle.cancel();
		this.handles.splice(this.handles.indexOf(handle), 1);
		return true;
	}
}
