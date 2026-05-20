import type { PermissionsString } from "discord.js";
import type { Precondition } from "../../../@types/precondition";

function missingPerms(
	has: ReadonlySet<string>,
	required: PermissionsString[],
): PermissionsString[] {
	return required.filter((p) => !has.has(p));
}

export const BotPermissions: Precondition = {
	name: "BotPermissions",
	run({ meta, interaction }) {
		if (!meta.botPermissions?.length) return { ok: true };
		if (!interaction.inGuild()) return { ok: true };

		const me = interaction.guild?.members.me;
		const botPerms = me?.permissionsIn(interaction.channelId);
		const missing = missingPerms(
			new Set(botPerms?.toArray() ?? []),
			meta.botPermissions,
		);

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
