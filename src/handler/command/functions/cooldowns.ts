export type CooldownScope = "user" | "guild" | "global";

type Key = string;

export type CooldownStoreOptions = {
	maxEntries?: number;
	pruneEvery?: number;
};

export class CooldownStore {
	private readonly until = new Map<Key, number>();
	private readonly maxEntries: number;
	private readonly pruneEvery: number;
	private operations = 0;

	constructor(options: CooldownStoreOptions = {}) {
		this.maxEntries = Math.max(1, options.maxEntries ?? 10_000);
		this.pruneEvery = Math.max(1, options.pruneEvery ?? 100);
	}

	public get size(): number {
		return this.until.size;
	}

	private buildKey(
		commandName: string,
		scope: CooldownScope,
		userId: string,
		guildId: string | null,
	): Key {
		switch (scope) {
			case "user":
				return `${commandName}:user:${userId}`;
			case "guild":
				// Fall back to userId if somehow called outside a guild
				return `${commandName}:guild:${guildId ?? userId}`;
			case "global":
				return `${commandName}:global`;
		}
	}

	public getRemainingMs(
		commandName: string,
		scope: CooldownScope,
		userId: string,
		guildId: string | null,
	): number {
		const key = this.buildKey(commandName, scope, userId, guildId);
		const now = Date.now();
		const end = this.until.get(key) ?? 0;
		const remaining = Math.max(0, end - now);

		// Prune expired entry on read to prevent unbounded memory growth
		if (remaining === 0) this.until.delete(key);
		this.pruneIfNeeded(now);

		return remaining;
	}

	public set(
		commandName: string,
		scope: CooldownScope,
		userId: string,
		guildId: string | null,
		cooldownMs: number,
	): void {
		const now = Date.now();
		const key = this.buildKey(commandName, scope, userId, guildId);
		this.until.set(key, now + cooldownMs);
		this.pruneIfNeeded(now);
	}

	private pruneIfNeeded(now: number): void {
		this.operations += 1;

		if (
			this.until.size <= this.maxEntries &&
			this.operations % this.pruneEvery !== 0
		) {
			return;
		}

		for (const [key, expiresAt] of this.until) {
			if (expiresAt <= now) this.until.delete(key);
		}

		while (this.until.size > this.maxEntries) {
			const oldest = this.until.keys().next().value;
			if (oldest === undefined) break;
			this.until.delete(oldest);
		}
	}
}
