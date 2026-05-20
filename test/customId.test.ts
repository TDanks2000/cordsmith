import { describe, expect, test } from "bun:test";
import {
	DISCORD_CUSTOM_ID_MAX_LENGTH,
	makeCustomId,
	parseCustomId,
} from "../src/handler/command/functions/customId";

describe("custom IDs", () => {
	test("builds and parses a valid command custom ID", () => {
		const id = makeCustomId("recommend", "pick", "user:movie");
		expect(parseCustomId(id)).toEqual({
			ok: true,
			commandName: "recommend",
			action: "pick",
			payload: "user:movie",
		});
	});

	test("rejects segments that would break parsing", () => {
		expect(() => makeCustomId("bad:name", "pick")).toThrow(
			/cannot contain/,
		);
		expect(() => makeCustomId("recommend", "")).toThrow(/cannot be empty/);
	});

	test("rejects IDs over Discord's 100 character limit", () => {
		const payload = "x".repeat(DISCORD_CUSTOM_ID_MAX_LENGTH);
		expect(() => makeCustomId("cmd", "act", payload)).toThrow(
			/Discord allows at most/,
		);
	});
});
