export type ParsedCustomId =
	| {
			ok: true;
			commandName: string;
			action: string;
			payload?: string;
	  }
	| {
			ok: false;
			reason: string;
	  };

export const DISCORD_CUSTOM_ID_MAX_LENGTH = 100;

function validateSegment(label: string, value: string): void {
	if (value.trim().length === 0) {
		throw new Error(`${label} cannot be empty.`);
	}

	if (value.includes(":")) {
		throw new Error(`${label} cannot contain ":".`);
	}
}

/**
 * Format: cmd:<commandName>:<action>[:<payload>]
 */
export function parseCustomId(customId: string): ParsedCustomId {
	if (!customId.startsWith("cmd:")) {
		return { ok: false, reason: "Not a cmd:* customId" };
	}

	// cmd:<command>:<action>[:<payload>]
	const parts = customId.split(":");

	if (parts.length < 3) {
		return { ok: false, reason: "Invalid cmd customId format" };
	}

	const commandName = parts[1]?.trim();
	const action = parts[2]?.trim();
	const payload = parts.slice(3).join(":").trim();

	if (!commandName) return { ok: false, reason: "Missing commandName" };
	if (!action) return { ok: false, reason: "Missing action" };

	return {
		ok: true,
		commandName,
		action,
		payload: payload.length > 0 ? payload : undefined,
	};
}

/**
 * Helper to build IDs consistently.
 */
export function makeCustomId(
	commandName: string,
	action: string,
	payload?: string,
): string {
	validateSegment("commandName", commandName);
	validateSegment("action", action);

	const id =
		payload === undefined || payload.length === 0
			? `cmd:${commandName}:${action}`
			: `cmd:${commandName}:${action}:${payload}`;

	if (id.length > DISCORD_CUSTOM_ID_MAX_LENGTH) {
		throw new Error(
			`customId is ${id.length} characters; Discord allows at most ${DISCORD_CUSTOM_ID_MAX_LENGTH}.`,
		);
	}

	return id;
}
