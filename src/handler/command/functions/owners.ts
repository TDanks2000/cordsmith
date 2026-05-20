export function parseOwnerIds(raw: string | undefined): Set<string> {
	if (!raw) return new Set();

	const ids = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	return new Set(ids);
}
