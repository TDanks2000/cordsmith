import { describe, expect, test } from "bun:test";
import { combineRegistrationPlans } from "../src/handler/manager/registrationPlans";

describe("combineRegistrationPlans", () => {
	test("combines payloads that register to the same Discord scope", () => {
		const combined = combineRegistrationPlans([
			{
				register: {
					token: "token",
					applicationId: "app",
					where: { mode: "guild", guildId: "guild" },
				},
				commandJson: [{ name: "slash" }],
				cache: true,
			},
			{
				register: {
					token: "token",
					applicationId: "app",
					where: { mode: "guild", guildId: "guild" },
				},
				commandJson: [{ name: "menu" }],
				cache: false,
			},
		]);

		expect(combined).toHaveLength(1);
		expect(combined[0]?.commandJson).toEqual([
			{ name: "slash" },
			{ name: "menu" },
		]);
		expect(combined[0]?.cache).toBe(false);
	});

	test("keeps different Discord scopes separate", () => {
		const combined = combineRegistrationPlans([
			{
				register: {
					token: "token",
					applicationId: "app",
					where: { mode: "global" },
				},
				commandJson: [{ name: "global" }],
				cache: true,
			},
			{
				register: {
					token: "token",
					applicationId: "app",
					where: { mode: "guild", guildId: "guild" },
				},
				commandJson: [{ name: "guild" }],
				cache: true,
			},
		]);

		expect(combined).toHaveLength(2);
	});

	test("combines payloads for the same multi-guild Discord scope", () => {
		const combined = combineRegistrationPlans([
			{
				register: {
					token: "token",
					applicationId: "app",
					where: { mode: "guilds", guildIds: ["b", "a"] },
				},
				commandJson: [{ name: "slash" }],
				cache: true,
			},
			{
				register: {
					token: "token",
					applicationId: "app",
					where: { mode: "guilds", guildIds: ["a", "b"] },
				},
				commandJson: [{ name: "menu" }],
				cache: true,
			},
		]);

		expect(combined).toHaveLength(1);
		expect(combined[0]?.commandJson).toEqual([
			{ name: "slash" },
			{ name: "menu" },
		]);
	});
});
