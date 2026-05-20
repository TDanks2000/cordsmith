import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { Collection } from "discord.js";
import { attachInteractionListener } from "../src/handler/command/functions/attachInteractionListener";
import { CooldownStore } from "../src/handler/command/functions/cooldowns";
import { attachContextMenuListener } from "../src/handler/context/functions/attachContextMenuListener";

describe("interaction listener attachment", () => {
	test("returns a removable slash/component interaction listener", () => {
		const client = new EventEmitter();
		const attached = attachInteractionListener({
			client: client as never,
			commands: new Collection(),
			ownerIds: new Set(),
			cooldowns: new CooldownStore(),
			preconditionRegistry: new Map(),
		});

		expect(client.listenerCount("interactionCreate")).toBe(1);
		client.off(attached.eventName, attached.fn);
		expect(client.listenerCount("interactionCreate")).toBe(0);
	});

	test("returns a removable context menu interaction listener", () => {
		const client = new EventEmitter();
		const attached = attachContextMenuListener({
			client: client as never,
			commands: new Collection(),
			ownerIds: new Set(),
			cooldowns: new CooldownStore(),
			preconditionRegistry: new Map(),
		});

		expect(client.listenerCount("interactionCreate")).toBe(1);
		client.off(attached.eventName, attached.fn);
		expect(client.listenerCount("interactionCreate")).toBe(0);
	});
});
