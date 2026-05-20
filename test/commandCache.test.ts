import { describe, expect, test } from "bun:test";
import { safeCacheComponent } from "../src/handler/command/functions/commandCache";

describe("command registration cache paths", () => {
	test("sanitizes unsafe cache filename components", () => {
		const safe = safeCacheComponent("../prod/guild");

		expect(safe).not.toContain("/");
		expect(safe).not.toContain("..");
		expect(safe).toMatch(/prod_guild/);
	});
});
