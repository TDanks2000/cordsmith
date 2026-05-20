export function requireEnv(name: string): string {
	const value = Bun.env[name];
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}
