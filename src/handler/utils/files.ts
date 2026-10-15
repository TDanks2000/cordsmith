import { realpath, stat } from "node:fs/promises";
import path from "node:path";

export type DiscoveredModuleFiles = {
	rootDir: string;
	files: string[];
};

const EXTENSION_PATTERN = /^\.[A-Za-z0-9]+$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

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

function globPattern(extensions: string[]): string {
	if (extensions.length === 1) return `**/*${extensions[0]}`;
	return `**/*.{${extensions.map((ext) => ext.slice(1)).join(",")}}`;
}

/** Plain code-point comparison: deterministic regardless of system locale. */
export function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export async function discoverModuleFiles(options: {
	dir: string;
	extensions: string[];
}): Promise<DiscoveredModuleFiles> {
	const rootDir = await realpath(resolveDir(options.dir));

	if (!(await stat(rootDir)).isDirectory()) {
		throw new Error(`Module directory is not a directory: ${rootDir}`);
	}

	// One scan for all extensions. Scanning relative to `cwd` means glob
	// metacharacters in the root path itself (e.g. "[bot]") are never
	// interpreted as part of the pattern.
	const glob = new Bun.Glob(globPattern(normalizeExtensions(options.extensions)));
	const candidates: string[] = [];

	for await (const filePath of glob.scan({ cwd: rootDir, absolute: true })) {
		if (!DECLARATION_FILE.test(filePath)) candidates.push(filePath);
	}

	// Resolve symlinks concurrently and drop anything that escapes the root.
	const resolved = await Promise.all(
		candidates.map(async (filePath) => {
			const realFilePath = await realpath(filePath);
			if (!isInsideDir(rootDir, realFilePath)) return null;
			return (await stat(realFilePath)).isFile() ? realFilePath : null;
		}),
	);

	const files = new Set<string>();
	for (const filePath of resolved) {
		if (filePath) files.add(filePath);
	}

	return {
		rootDir,
		files: [...files].sort(compareStrings),
	};
}
