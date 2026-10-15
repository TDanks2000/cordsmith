import type { Precondition } from "../../../@types/precondition";

export const Cooldown: Precondition = {
	name: "Cooldown",
	run({ meta, interaction, cooldowns }) {
		if (!meta.cooldownMs || meta.cooldownMs <= 0) return { ok: true };

		// Check and start the cooldown in one step. This runs after every other
		// precondition, so a rejected invocation never consumes a cooldown.
		const remaining = cooldowns.consume(
			interaction.commandName,
			meta.cooldownScope ?? "user",
			interaction.user.id,
			interaction.guildId,
			meta.cooldownMs,
		);

		if (remaining > 0) {
			return {
				ok: false,
				message: `Please wait ${Math.ceil(remaining / 1000)}s before using this command again.`,
				ephemeral: true,
			};
		}

		return { ok: true };
	},
};
