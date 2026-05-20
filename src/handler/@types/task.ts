import type { ClientClass } from "../../structure/Client";

export type TaskContext<TClient = ClientClass> = {
	client: TClient;
};

export type TaskModule<TClient = ClientClass> = {
	/**
	 * Human-readable name shown in logs.
	 * Inferred from the filename if not provided.
	 */
	name?: string;

	/**
	 * How often the task runs, in milliseconds.
	 *
	 * Alternatively, provide a cron expression via `cron`.
	 * Exactly one of `intervalMs` or `cron` must be set.
	 */
	intervalMs?: number;

	/**
	 * Cron expression (standard 5-field: "min hour dom mon dow").
	 *
	 * Examples:
	 *   "0 * * * *"   — every hour on the hour
	 *   "30 9 * * 1"  — every Monday at 09:30
	 *   "* /5 * * * *" — every 5 minutes
	 *
	 * Requires `intervalMs` to be unset.
	 */
	cron?: string;

	/**
	 * Whether to run the task immediately on startup before the first
	 * interval/cron tick. Defaults to false.
	 */
	runOnStart?: boolean;

	/**
	 * If false, the task is loaded but never scheduled. Defaults to true.
	 */
	enabled?: boolean;

	execute: (ctx: TaskContext<TClient>) => Promise<void>;
};

export type LoadedTask<TClient = ClientClass> = {
	name: string;
	filePath: string;
	intervalMs?: number;
	cron?: string;
	runOnStart: boolean;
	execute: TaskModule<TClient>["execute"];
};

/**
 * Helper for better type inference in task files.
 *
 * Usage:
 * export default defineTask({
 *   intervalMs: 60_000,
 *   runOnStart: true,
 *   async execute({ client }) {}
 * })
 */
export function defineTask(mod: TaskModule): TaskModule {
	return mod;
}
