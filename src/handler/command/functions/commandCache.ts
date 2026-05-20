import { mkdir } from "node:fs/promises";
import path from "node:path";

export type RegisterScope =
	| { mode: "guild"; guildId: string }
	| { mode: "global" };

function cacheDir(): string {
	return path.join(process.cwd(), ".cache", "discord-commands");
}

function hashText(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

export function safeCacheComponent(value: string): string {
	const safe = value
		.replace(/[^A-Za-z0-9_.-]/g, "_")
		.replace(/\.{2,}/g, "_");

	if (safe === value && safe.length > 0) return safe;

	const fallback = safe.replace(/^_+|_+$/g, "") || "value";
	return `${fallback}.${hashText(value).slice(0, 12)}`;
}

function fileBaseName(options: {
	scope: RegisterScope;
	applicationId: string;
	envKey?: string;
}): string {
	const { scope, applicationId, envKey } = options;

	const applicationPart = safeCacheComponent(applicationId);
	const envPart = envKey ? `.${safeCacheComponent(envKey)}` : "";

	if (scope.mode === "global") {
		return `global.${applicationPart}${envPart}.hash`;
	}

	return `guild.${safeCacheComponent(
		scope.guildId,
	)}.${applicationPart}${envPart}.hash`;
}

function hashFilePath(options: {
	scope: RegisterScope;
	applicationId: string;
	envKey?: string;
}): string {
	return path.join(cacheDir(), fileBaseName(options));
}

async function ensureDirExists(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
}

export async function readCachedHash(options: {
	scope: RegisterScope;
	applicationId: string;
	envKey?: string;
}): Promise<string | null> {
	const file = hashFilePath(options);

	try {
		const text = await Bun.file(file).text();
		const trimmed = text.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
}

export async function writeCachedHash(options: {
	scope: RegisterScope;
	applicationId: string;
	hash: string;
	envKey?: string;
}): Promise<void> {
	await ensureDirExists(cacheDir());

	const file = hashFilePath({
		scope: options.scope,
		applicationId: options.applicationId,
		envKey: options.envKey,
	});

	await Bun.write(file, `${options.hash}\n`);
}

/**
 * Hash the final command JSON payload we send to Discord.
 */
export function hashCommandJson(commandJson: unknown[]): string {
	const text = JSON.stringify(commandJson);
	return hashText(text);
}
