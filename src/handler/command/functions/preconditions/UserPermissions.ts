import type { Precondition } from "../../../@types/precondition";

export const UserPermissions: Precondition = {
	name: "UserPermissions",
	run({ meta, interaction }) {
		if (!meta.userPermissions?.length) return { ok: true };
		if (!interaction.inGuild()) return { ok: true };

		const missing = interaction.memberPermissions.missing(
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
