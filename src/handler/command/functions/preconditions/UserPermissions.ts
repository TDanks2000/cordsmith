import type { PermissionsString } from "discord.js";
import type { Precondition } from "../../../@types/precondition";

function missingPerms(
	has: ReadonlySet<string>,
	required: PermissionsString[],
): PermissionsString[] {
	return required.filter((p) => !has.has(p));
}

export const UserPermissions: Precondition = {
	name: "UserPermissions",
	run({ meta, interaction }) {
		if (!meta.userPermissions?.length) return { ok: true };
		if (!interaction.inGuild()) return { ok: true };

		const memberPerms = interaction.memberPermissions;
		const missing = missingPerms(
			new Set(memberPerms?.toArray() ?? []),
			meta.userPermissions,
		);

		if (missing.length > 0) {
			return {
				ok: false,
				message: `You're missing permissions: ${missing.join(", ")}`,
				ephemeral: true,
			};
		}

		return { ok: true };
	},
};
