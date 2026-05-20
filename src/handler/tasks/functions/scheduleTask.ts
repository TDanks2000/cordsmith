import { logger } from "../../../utils";
import type { LoadedTask, TaskContext } from "../../@types/task";
import { msUntilNextCronTick, parseCron } from "./parseCron";

export type TaskHandle = {
	name: string;
	cancel: () => void;
};

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
	// Track the active timer and its type separately so we call the correct
	// clear function — calling clearInterval on a setTimeout id is a no-op in
	// most runtimes but is semantically wrong and confusing.
	let timer: ReturnType<typeof setTimeout> | null = null;
	let timerType: "timeout" | "interval" | null = null;
	let running = false;

	async function run(): Promise<void> {
		if (cancelled) return;
		if (running) return;

		running = true;
		try {
			await task.execute(ctx);
		} catch (err) {
			logger.error(`Error in task "${task.name}"`, err);
		} finally {
			running = false;
		}
	}

	function cancelTimer(): void {
		if (timer === null) return;
		if (timerType === "interval") {
			clearInterval(timer);
		} else {
			clearTimeout(timer);
		}
		timer = null;
		timerType = null;
	}

	if (task.intervalMs) {
		const intervalMs = task.intervalMs;

		async function scheduleNextInterval(): Promise<void> {
			if (cancelled) return;
			const start = Date.now();
			await run();
			if (cancelled) return;
			const elapsed = Date.now() - start;
			const delay = Math.max(0, intervalMs - elapsed);
			timer = setTimeout(scheduleNextInterval, delay);
			timerType = "timeout";
		}

		timer = setTimeout(
			scheduleNextInterval,
			task.runOnStart ? 0 : intervalMs,
		);
		timerType = "timeout";

		logger.info(`Scheduled task "${task.name}" every ${intervalMs}ms.`);
	} else if (task.cron) {
		const parsed = parseCron(task.cron);

		if (task.runOnStart) {
			void run();
		}

		function scheduleNextCronTick(): void {
			if (cancelled) return;
			const delay = msUntilNextCronTick(parsed);
			timer = setTimeout(async () => {
				await run();
				scheduleNextCronTick();
			}, delay);
			timerType = "timeout";
		}

		scheduleNextCronTick();

		logger.info(`Scheduled task "${task.name}" with cron "${task.cron}".`);
	}

	return {
		name: task.name,
		cancel(): void {
			cancelled = true;
			cancelTimer();
			logger.info(`Cancelled task "${task.name}".`);
		},
	};
}
