import { type InteractionReplyOptions, MessageFlags } from "discord.js";
import { logger } from "../../utils/logger";

// RepliableInteraction from discord.js is a union of *concrete* narrowed types,
// so the abstract base classes (MessageComponentInteraction etc.) aren't
// assignable to it. This structural type targets only what replySafe actually
// needs, which is both correct and sufficient.
export type Repliable = {
	deferred: boolean;
	replied: boolean;
	reply: (options: InteractionReplyOptions) => Promise<unknown>;
	followUp: (options: InteractionReplyOptions) => Promise<unknown>;
};

/**
 * Build a reply payload. Uses `flags` rather than the deprecated `ephemeral`
 * option, which makes discord.js emit a deprecation warning on every reply.
 */
export function replyPayload(
	content: string,
	ephemeral = true,
): InteractionReplyOptions {
	return ephemeral ? { content, flags: MessageFlags.Ephemeral } : { content };
}

/**
 * Reply, or follow up if the interaction was already acknowledged.
 *
 * Never throws: replies fail routinely (expired tokens, deleted channels) and
 * an error escaping an event listener becomes an unhandled rejection.
 */
export async function replySafe(
	interaction: Repliable,
	content: string,
	ephemeral = true,
): Promise<void> {
	const payload = replyPayload(content, ephemeral);

	try {
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp(payload);
		} else {
			await interaction.reply(payload);
		}
	} catch (err) {
		logger.warn("Failed to send interaction reply", { error: String(err) });
	}
}
