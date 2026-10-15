import { describe, expect, test } from "bun:test";
import { CooldownStore } from "../src/handler/command/functions/cooldowns";
import { Cooldown } from "../src/handler/command/functions/preconditions/Cooldown";
import { OwnerOnly } from "../src/handler/command/functions/preconditions/OwnerOnly";
import { UserPermissions } from "../src/handler/command/functions/preconditions/UserPermissions";
import {
	createPreconditionResolver,
	resolvePreconditions,
	runPreconditions,
} from "../src/handler/command/functions/runPreconditions";
import type { Precondition } from "../src/handler/@types/precondition";

const custom: Precondition = { name: "Custom", run: () => ({ ok: true }) };

describe("resolvePreconditions", () => {
	test("returns an empty chain for commands without guards", () => {
		expect(
			resolvePreconditions({ meta: undefined, registry: new Map(), commandName: "x" }),
		).toEqual([]);
		expect(
			resolvePreconditions({ meta: {}, registry: new Map(), commandName: "x" }),
		).toEqual([]);
	});

	test("orders built-ins, then custom preconditions, then Cooldown", () => {
		const chain = resolvePreconditions({
			meta: {
				cooldownMs: 1000,
				ownerOnly: true,
				userPermissions: ["BanMembers"],
				preconditions: ["Custom"],
			},
			registry: new Map([["Custom", custom]]),
			commandName: "x",
		});

		expect(chain).toEqual([OwnerOnly, UserPermissions, custom, Cooldown]);
	});

	test("throws for unregistered custom preconditions", () => {
		expect(() =>
			resolvePreconditions({
				meta: { preconditions: ["Missing"] },
				registry: new Map(),
				commandName: "ban",
			}),
		).toThrow(/"Missing" is referenced by "ban"/);
	});

	test("memoises chains per command", () => {
		const resolve = createPreconditionResolver(new Map());
		const cmd = { data: { name: "x" }, meta: { ownerOnly: true } };
		expect(resolve(cmd)).toBe(resolve(cmd));
	});
});

describe("runPreconditions", () => {
	test("does not consume a cooldown when an earlier check fails", async () => {
		const cooldowns = new CooldownStore();
		const meta = { ownerOnly: true, cooldownMs: 60_000 };
		const chain = resolvePreconditions({ meta, registry: new Map(), commandName: "x" });
		const ctx = {
			interaction: {
				commandName: "x",
				user: { id: "not-owner" },
				guildId: null,
			} as never,
			client: {} as never,
			meta,
			ownerIds: new Set(["owner"]),
			cooldowns,
		};

		const result = await runPreconditions(chain, ctx);

		expect(result.ok).toBe(false);
		expect(cooldowns.size).toBe(0);
	});

	test("supports async preconditions and returns the first failure", async () => {
		const failing: Precondition = {
			name: "Fail",
			run: async () => ({ ok: false, message: "nope" }),
		};

		const result = await runPreconditions([custom, failing], {} as never);

		expect(result).toEqual({
			ok: false,
			failure: { message: "nope", ephemeral: true },
		});
	});
});

describe("CooldownStore.consume", () => {
	test("starts a cooldown and reports the remaining time on repeat", () => {
		const store = new CooldownStore();

		expect(store.consume("cmd", "user", "1", null, 60_000)).toBe(0);

		const remaining = store.consume("cmd", "user", "1", null, 60_000);
		expect(remaining).toBeGreaterThan(59_000);
		expect(store.consume("cmd", "user", "2", null, 60_000)).toBe(0);
	});
});
