import { describe, expect, mock, test } from "bun:test";
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

	test("routes slash subcommands before falling back to execute", async () => {
		const client = new EventEmitter();
		const execute = mock(async () => {});
		const subcommand = mock(async () => {});
		const attached = attachInteractionListener({
			client: client as never,
			commands: new Collection([
				[
					"admin",
					{
						data: { name: "admin", toJSON: () => ({ name: "admin" }) },
						execute,
						subcommands: {
							"mod/kick": subcommand,
						},
					},
				],
			]),
			ownerIds: new Set(),
			cooldowns: new CooldownStore(),
			preconditionRegistry: new Map(),
		});

		await attached.fn({
			commandName: "admin",
			user: { id: "user" },
			guildId: "guild",
			inGuild: () => true,
			isAutocomplete: () => false,
			isButton: () => false,
			isAnySelectMenu: () => false,
			isModalSubmit: () => false,
			isChatInputCommand: () => true,
			options: {
				getSubcommand: () => "kick",
				getSubcommandGroup: () => "mod",
			},
		} as never);

		expect(subcommand).toHaveBeenCalledTimes(1);
		expect(execute).not.toHaveBeenCalled();
	});

	test("calls onError and replies with the generic fallback if it did not reply", async () => {
		const client = new EventEmitter();
		const onError = mock(async () => {});
		const reply = mock(async () => {});
		const attached = attachInteractionListener({
			client: client as never,
			commands: new Collection([
				[
					"explode",
					{
						data: {
							name: "explode",
							toJSON: () => ({ name: "explode" }),
						},
						async execute() {
							throw new Error("boom");
						},
					},
				],
			]),
			ownerIds: new Set(),
			cooldowns: new CooldownStore(),
			preconditionRegistry: new Map(),
			errorMessages: { genericError: "Custom failure." },
			onError,
		});

		await attached.fn({
			commandName: "explode",
			user: { id: "user" },
			guildId: null,
			deferred: false,
			replied: false,
			reply,
			followUp: mock(async () => {}),
			inGuild: () => false,
			isAutocomplete: () => false,
			isButton: () => false,
			isAnySelectMenu: () => false,
			isModalSubmit: () => false,
			isChatInputCommand: () => true,
			options: {
				getSubcommand: () => null,
				getSubcommandGroup: () => null,
			},
		} as never);

		expect(onError).toHaveBeenCalledTimes(1);
		expect(reply).toHaveBeenCalledWith({
			content: "Custom failure.",
			ephemeral: true,
		});
	});
});
