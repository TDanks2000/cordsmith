import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export type DiscoveredModuleFiles = {
	rootDir: string;
	files: string[];
};

const EXTENSION_PATTERN = /^\.[A-Za-z0-9]+$/;

function resolveDir(dir: string): string {
	return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

function isInsideDir(rootDir: string, filePath: string): boolean {
	const rel = path.relative(rootDir, filePath);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function normalizeExtensions(extensions: string[]): string[] {
	const normalized = new Set<string>();

	for (const ext of extensions) {
		if (!EXTENSION_PATTERN.test(ext)) {
			throw new Error(
				`Invalid module extension "${ext}". Use simple extensions like ".ts", ".js", or ".mjs".`,
			);
		}

		normalized.add(ext);
	}

	if (normalized.size === 0) {
		throw new Error("At least one module extension is required.");
	}

	return [...normalized].sort();
}

export async function discoverModuleFiles(options: {
	dir: string;
	extensions: string[];
}): Promise<DiscoveredModuleFiles> {
	const rootDir = await realpath(resolveDir(options.dir));
	const rootStats = await lstat(rootDir);

	if (!rootStats.isDirectory()) {
		throw new Error(`Module directory is not a directory: ${rootDir}`);
	}

	const extensions = normalizeExtensions(options.extensions);
	const files = new Set<string>();

	for (const ext of extensions) {
		const pattern = path.join(rootDir, `**/*${ext}`);

		for await (const filePath of new Bun.Glob(pattern).scan()) {
			if (filePath.endsWith(".d.ts")) continue;

			const realFilePath = await realpath(filePath);
			if (!isInsideDir(rootDir, realFilePath)) continue;

			const stats = await lstat(realFilePath);
			if (!stats.isFile()) continue;

			files.add(realFilePath);
		}
	}

	return {
		rootDir,
		files: [...files].sort((a, b) => a.localeCompare(b)),
	};
}
