import { describe, expect, test } from "bun:test";
import { DMOnly } from "../src/handler/command/functions/preconditions/DMOnly";
import { CooldownStore } from "../src/handler/command/functions/cooldowns";

function makeInteraction(inGuild: boolean) {
	return {
		inGuild: () => inGuild,
	} as never;
}

describe("DMOnly", () => {
	test("allows commands without dmOnly meta", () => {
		const result = DMOnly.run({
			interaction: makeInteraction(true),
			client: {} as never,
			meta: {},
			ownerIds: new Set(),
			cooldowns: new CooldownStore(),
		});

		expect(result).toEqual({ ok: true });
	});

	test("blocks dmOnly commands in guilds", () => {
		const result = DMOnly.run({
			interaction: makeInteraction(true),
			client: {} as never,
			meta: { dmOnly: true },
			ownerIds: new Set(),
			cooldowns: new CooldownStore(),
		});

		expect(result).toEqual({
			ok: false,
			message: "This command can only be used in DMs.",
			ephemeral: true,
		});
	});

	test("allows dmOnly commands in DMs", () => {
		const result = DMOnly.run({
			interaction: makeInteraction(false),
			client: {} as never,
			meta: { dmOnly: true },
			ownerIds: new Set(),
			cooldowns: new CooldownStore(),
		});

		expect(result).toEqual({ ok: true });
	});
});
