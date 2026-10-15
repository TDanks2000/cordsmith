import { PermissionsBitField, type PermissionsString } from "discord.js";
import { compareStrings } from "./files";

type RegistrableCommand = {
	data: { toJSON: () => unknown };
	meta?: { defaultMemberPermissions?: PermissionsString[] };
};

/**
 * Serialise commands to plain JSON for Discord registration.
 *
 * Permissions are applied to the serialised JSON object rather than the
 * builder so we never mutate the in-memory command store as a side effect.
 *
 * Output is sorted by name (code-point order, not locale order) so the
 * registration hash is stable regardless of file discovery order or the
 * machine's locale — otherwise the cache could flap between environments.
 */
export function serializeForRegistration(
	commands: Iterable<RegistrableCommand>,
): Array<Record<string, unknown>> {
	const out: Array<Record<string, unknown>> = [];

	for (const cmd of commands) {
		const json = cmd.data.toJSON() as Record<string, unknown>;
		const perms = cmd.meta?.defaultMemberPermissions;

		if (perms && perms.length > 0) {
			json.default_member_permissions = String(
				new PermissionsBitField(perms).bitfield,
			);
		}

		out.push(json);
	}

	return out.sort((a, b) =>
		compareStrings(String(a.name ?? ""), String(b.name ?? "")),
	);
}
