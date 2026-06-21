import type { RegisterMode } from "../command/functions/registerCommands";

export type HandlerRegistrationPlan = {
	register: {
		token: string;
		applicationId: string;
		where: RegisterMode;
	};
	commandJson: unknown[];
	cache: boolean;
};

export type CombinedRegistrationPlan = HandlerRegistrationPlan;

function whereKey(where: RegisterMode): string {
	switch (where.mode) {
		case "none":
			return "none";
		case "global":
			return "global";
		case "guild":
			return `guild:${where.guildId}`;
		case "guilds":
			return `guilds:${where.guildIds.slice().sort().join(",")}`;
	}
}

function registrationKey(plan: HandlerRegistrationPlan): string {
	const { register } = plan;
	return [
		register.token,
		register.applicationId,
		whereKey(register.where),
	].join("\0");
}

export function combineRegistrationPlans(
	plans: HandlerRegistrationPlan[],
): CombinedRegistrationPlan[] {
	const grouped = new Map<string, CombinedRegistrationPlan>();

	for (const plan of plans) {
		const key = registrationKey(plan);
		const existing = grouped.get(key);

		if (!existing) {
			grouped.set(key, {
				register: plan.register,
				commandJson: [...plan.commandJson],
				cache: plan.cache,
			});
			continue;
		}

		existing.commandJson.push(...plan.commandJson);
		existing.cache = existing.cache && plan.cache;
	}

	return [...grouped.values()];
}
