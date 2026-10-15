import type { Precondition } from "../../../@types/precondition";

export const BotPermissions: Precondition = {
	name: "BotPermissions",
	run({ meta, interaction }) {
		if (!meta.botPermissions?.length) return { ok: true };
		if (!interaction.inGuild()) return { ok: true };

		// Discord sends the bot's resolved channel permissions with every
		// interaction, so this needs no member/channel cache and works in
		// threads and uncached guilds.
		const missing = interaction.appPermissions.missing(meta.botPermissions);

		if (missing.length > 0) {
			return {
				ok: false,
				message: `I'm missing permissions: ${missing.join(", ")}`,
				ephemeral: true,
			};
		}

		return { ok: true };
	},
};
