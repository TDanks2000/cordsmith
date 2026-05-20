import { describe, expect, test } from "bun:test";
import { scheduleTask } from "../src/handler/tasks/functions/scheduleTask";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("scheduleTask", () => {
	test("does not overlap interval task executions when runOnStart is enabled", async () => {
		let activeRuns = 0;
		let overlapped = false;
		let runCount = 0;

		const handle = scheduleTask(
			{
				name: "slow",
				filePath: "slow.ts",
				intervalMs: 5,
				runOnStart: true,
				async execute() {
					runCount += 1;
					activeRuns += 1;
					if (activeRuns > 1) overlapped = true;
					await sleep(20);
					activeRuns -= 1;
				},
			},
			{ client: {} as never },
		);

		await sleep(55);
		handle.cancel();
		await sleep(25);

		expect(runCount).toBeGreaterThanOrEqual(2);
		expect(overlapped).toBe(false);
	});
});
