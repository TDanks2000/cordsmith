import { describe, expect, test } from "bun:test";
import { CooldownStore } from "../src/handler/command/functions/cooldowns";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("CooldownStore", () => {
	test("bounds stored cooldown entries", () => {
		const store = new CooldownStore({ maxEntries: 2, pruneEvery: 1 });

		store.set("a", "user", "1", null, 60_000);
		store.set("b", "user", "2", null, 60_000);
		store.set("c", "user", "3", null, 60_000);

		expect(store.size).toBe(2);
		expect(store.getRemainingMs("a", "user", "1", null)).toBe(0);
	});

	test("prunes expired entries during normal operations", async () => {
		const store = new CooldownStore({ maxEntries: 10, pruneEvery: 1 });

		store.set("old", "user", "1", null, 1);
		await sleep(5);
		store.set("new", "user", "2", null, 60_000);

		expect(store.getRemainingMs("old", "user", "1", null)).toBe(0);
		expect(store.size).toBe(1);
	});
});
