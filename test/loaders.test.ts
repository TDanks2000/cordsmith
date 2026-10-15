import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCommandsFromDisk } from "../src/handler/command/functions/loadCommands";
import { loadEventsFromDisk } from "../src/handler/events/functions/loadEvents";
import { loadTasksFromDisk } from "../src/handler/tasks/functions/loadTasks";
import { serializeForRegistration } from "../src/handler/utils/registration";

async function makeDir(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "cordsmith-load-"));
	for (const [rel, content] of Object.entries(files)) {
		const file = path.join(root, rel);
		await mkdir(path.dirname(file), { recursive: true });
		await writeFile(file, content);
	}
	return root;
}

describe("loaders", () => {
	test("loads commands from default and named exports", async () => {
		const root = await makeDir({
			"ping.ts": `export default { data: { name: "ping", toJSON: () => ({ name: "ping" }) }, async execute() {} };`,
			"named.ts": `export const data = { name: "named", toJSON: () => ({ name: "named" }) };
export async function execute() {}`,
		});

		const { commands } = await loadCommandsFromDisk({
			commandsDir: root,
			extensions: [".ts"],
		});

		expect([...commands.keys()].sort()).toEqual(["named", "ping"]);
	});

	test("includes the file path when a module fails to import", async () => {
		const root = await makeDir({ "broken.ts": `throw new Error("bad module");` });

		await expect(
			loadCommandsFromDisk({ commandsDir: root, extensions: [".ts"] }),
		).rejects.toThrow(/Failed to import module: .*broken\.ts/);
	});

	test("names flat event files after the event and nested ones after the folder", async () => {
		const root = await makeDir({
			"clientReady.ts": `export default { once: true, async execute() {} };`,
			"messageCreate/log.ts": `export default { order: 2, async execute() {} };`,
			"messageCreate/first.ts": `export default { order: 1, async execute() {} };`,
		});

		const events = await loadEventsFromDisk({ eventsDir: root, extensions: [".ts"] });

		expect(events.get("clientReady")?.[0]?.once).toBe(true);
		expect(
			events.get("messageCreate")?.map((l) => path.basename(l.filePath)),
		).toEqual(["first.ts", "log.ts"]);
	});

	test("rejects invalid cron expressions at load time with the file path", async () => {
		const root = await makeDir({
			"bad.ts": `export default { cron: "61 * * * *", async execute() {} };`,
		});

		await expect(
			loadTasksFromDisk({ tasksDir: root, extensions: [".ts"] }),
		).rejects.toThrow(/Invalid cron for task "bad"/);
	});
});

describe("serializeForRegistration", () => {
	test("sorts by code point and applies default member permissions", () => {
		const json = serializeForRegistration([
			{ data: { toJSON: () => ({ name: "b" }) } },
			{
				data: { toJSON: () => ({ name: "a" }) },
				meta: { defaultMemberPermissions: ["BanMembers"] },
			},
			{ data: { toJSON: () => ({ name: "Get Avatar" }) } },
		]);

		expect(json.map((c) => c.name)).toEqual(["Get Avatar", "a", "b"]);
		expect(json[1]?.default_member_permissions).toBe("4");
	});
});
