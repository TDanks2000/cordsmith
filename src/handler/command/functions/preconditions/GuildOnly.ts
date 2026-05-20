import type { Precondition } from "../../../@types/precondition";

export const GuildOnly: Precondition = {
	name: "GuildOnly",
	run({ meta, interaction }) {
		if (!meta.guildOnly) return { ok: true };

		if (!interaction.inGuild()) {
			return {
				ok: false,
				message: "This command can only be used in a server.",
				ephemeral: true,
			};
		}

		return { ok: true };
	},
};
