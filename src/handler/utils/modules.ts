import { pathToFileURL } from "node:url";

export type ImportedModule = {
	filePath: string;
	/** The default export, or the module namespace if there is no default. */
	mod: unknown;
};

/**
 * Import every file concurrently, preserving the input order in the result.
 *
 * Modules may either `export default { ... }` or use named exports
 * (`export const data = ...; export async function execute() {}`).
 */
export async function importModules(
	files: readonly string[],
): Promise<ImportedModule[]> {
	return Promise.all(
		files.map(async (filePath) => {
			let imported: Record<string, unknown>;

			try {
				imported = await import(pathToFileURL(filePath).href);
			} catch (cause) {
				throw new Error(`Failed to import module: ${filePath}`, { cause });
			}

			return { filePath, mod: imported.default ?? imported };
		}),
	);
}
