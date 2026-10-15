import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	discoverModuleFiles,
	normalizeExtensions,
} from "../src/handler/utils/files";

describe("module file discovery", () => {
	test("rejects unsafe extension patterns", () => {
		expect(() => normalizeExtensions(["../*.ts"])).toThrow(
			/Invalid module extension/,
		);
		expect(() => normalizeExtensions([])).toThrow(/At least one/);
	});

	test("discovers only files inside the configured root", async () => {
		const tmp = await mkdtemp(path.join(tmpdir(), "cordsmith-files-"));
		const root = path.join(tmp, "root");
		const nested = path.join(root, "nested");
		const outside = path.join(tmp, "outside.ts");

		await mkdir(nested, { recursive: true });
		await writeFile(path.join(nested, "ok.ts"), "export default {};");
		await writeFile(path.join(root, "skip.d.ts"), "export type Skip = true;");
		await writeFile(outside, "export default {};");
		try {
			await symlink(outside, path.join(root, "outside.ts"));
		} catch (err) {
			// Creating symlinks on Windows requires Developer Mode or admin.
			if ((err as NodeJS.ErrnoException).code !== "EPERM") throw err;
		}

		const result = await discoverModuleFiles({
			dir: root,
			extensions: [".ts"],
		});

		expect(result.files).toHaveLength(1);
		expect(result.files[0]?.endsWith(path.join("nested", "ok.ts"))).toBe(
			true,
		);
	});
});

describe("module file discovery (extensions & paths)", () => {
	test("scans multiple extensions in one pass and handles glob metacharacters in the root", async () => {
		const tmp = await mkdtemp(path.join(tmpdir(), "cordsmith-files-"));
		const root = path.join(tmp, "[bot] commands");

		await mkdir(path.join(root, "a"), { recursive: true });
		await writeFile(path.join(root, "a", "one.ts"), "export default {};");
		await writeFile(path.join(root, "two.js"), "export default {};");
		await writeFile(path.join(root, "types.d.mts"), "export {};");
		await writeFile(path.join(root, "readme.md"), "# no");

		const result = await discoverModuleFiles({
			dir: root,
			extensions: [".ts", ".js", ".mts"],
		});

		expect(result.files.map((f) => path.relative(result.rootDir, f))).toEqual([
			path.join("a", "one.ts"),
			"two.js",
		]);
	});
});
