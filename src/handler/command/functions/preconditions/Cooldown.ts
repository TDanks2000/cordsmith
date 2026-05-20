import type { Precondition } from "../../../@types/precondition";

export const Cooldown: Precondition = {
	name: "Cooldown",
	run({ meta, interaction, cooldowns }) {
		if (!meta.cooldownMs || meta.cooldownMs <= 0) return { ok: true };

		const scope = meta.cooldownScope ?? "user";
		const guildId = interaction.guildId;

		const remaining = cooldowns.getRemainingMs(
			interaction.commandName,
			scope,
			interaction.user.id,
			guildId,
		);

		if (remaining > 0) {
			return {
				ok: false,
				message: `Please wait ${Math.ceil(remaining / 1000)}s before using this command again.`,
				ephemeral: true,
			};
		}

		// Set the cooldown now — after all other checks pass but before execute()
		cooldowns.set(
			interaction.commandName,
			scope,
			interaction.user.id,
			guildId,
			meta.cooldownMs,
		);

		return { ok: true };
	},
};
