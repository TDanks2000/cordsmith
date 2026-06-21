import type { Precondition } from "../../../@types/precondition";

export const DMOnly: Precondition = {
	name: "DMOnly",
	run({ meta, interaction }) {
		if (!meta.dmOnly) return { ok: true };

		if (interaction.inGuild()) {
			return {
				ok: false,
				message: "This command can only be used in DMs.",
				ephemeral: true,
			};
		}

		return { ok: true };
	},
};
