import { logger } from "../../../utils";
import type { LoadedTask, TaskContext } from "../../@types/task";
import { msUntilNextCronTick, parseCron } from "./parseCron";

export type TaskHandle = {
	name: string;
	cancel: () => void;
	/**
	 * Run the task immediately, outside its schedule. Resolves when the run
	 * (including retries) finishes. Skipped if the task is already running or
	 * has been cancelled.
	 */
	runNow: () => Promise<void>;
};

/**
 * setTimeout stores its delay as a signed 32-bit integer; anything larger
 * (~24.8 days) overflows and fires immediately. Longer waits are chained.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Schedules a single task and returns a handle to cancel it.
 *
 * Interval tasks use a self-rescheduling setTimeout rather than setInterval
 * so a slow execution cannot overlap with the next run — the next tick is only
 * scheduled after the current one completes.
 *
 * Cron tasks use a chain of setTimeout calls, recalculating the next tick
 * each time so the schedule stays accurate across DST changes and variable
 * month lengths.
 */
export function scheduleTask(task: LoadedTask, ctx: TaskContext): TaskHandle {
	let cancelled = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;

	function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function run(): Promise<void> {
		if (cancelled || running) return;
		running = true;

		const retry = task.retry;
		const delayMs = retry?.delayMs ?? 0;
		const maxAttempts = Math.max(0, retry?.attempts ?? 0) + 1;
		let lastErr: unknown;

		try {
			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				try {
					await task.execute(ctx);
					return;
				} catch (err) {
					lastErr = err;
				}

				if (attempt < maxAttempts) {
					logger.warn(
						`Task "${task.name}" failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`,
						{ error: String(lastErr) },
					);
					await sleep(delayMs);
					if (cancelled) return;
				}
			}

			logger.error(
				`Task "${task.name}" failed after ${maxAttempts} attempt(s)`,
				lastErr,
			);
		} finally {
			running = false;
		}
	}

	/** Schedule `fn` at an absolute time, safely beyond setTimeout's limit. */
	function scheduleAt(targetTime: number, fn: () => void): void {
		if (cancelled) return;

		const delay = targetTime - Date.now();

		timer =
			delay > MAX_TIMEOUT_MS
				? setTimeout(() => scheduleAt(targetTime, fn), MAX_TIMEOUT_MS)
				: setTimeout(fn, Math.max(0, delay));
	}

	if (task.intervalMs) {
		const intervalMs = task.intervalMs;

		async function tick(): Promise<void> {
			const start = Date.now();
			await run();
			scheduleAt(start + intervalMs, tick);
		}

		scheduleAt(Date.now() + (task.runOnStart ? 0 : intervalMs), tick);

		logger.info(`Scheduled task "${task.name}" every ${intervalMs}ms.`);
	} else if (task.cron) {
		const parsed = parseCron(task.cron);
		let lastTarget = 0;

		function scheduleNextCronTick(): void {
			// Timers can fire a few ms early; computing from the previous target
			// (rather than "now") guarantees we never schedule the same minute twice.
			const from = new Date(Math.max(Date.now(), lastTarget));
			lastTarget = from.getTime() + msUntilNextCronTick(parsed, from);

			scheduleAt(lastTarget, () => {
				// Schedule the following tick before running so a slow run doesn't
				// push the cadence back. Overlapping runs are skipped by run().
				scheduleNextCronTick();
				void run();
			});
		}

		if (task.runOnStart) void run();
		scheduleNextCronTick();

		logger.info(`Scheduled task "${task.name}" with cron "${task.cron}".`);
	}

	return {
		name: task.name,
		runNow: run,
		cancel(): void {
			cancelled = true;
			if (timer !== null) clearTimeout(timer);
			timer = null;
			logger.info(`Cancelled task "${task.name}".`);
		},
	};
}
