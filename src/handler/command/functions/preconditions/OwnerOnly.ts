import type { Precondition } from "../../../@types/precondition";

export const OwnerOnly: Precondition = {
	name: "OwnerOnly",
	run({ meta, ownerIds, interaction }) {
		if (!meta.ownerOnly) return { ok: true };

		if (!ownerIds.has(interaction.user.id)) {
			return {
				ok: false,
				message: "You can't use this command.",
				ephemeral: true,
			};
		}

		return { ok: true };
	},
};
