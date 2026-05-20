/**
 * Lightweight cron expression parser.
 *
 * Supports standard 5-field cron: "min hour dom mon dow"
 * Fields support: "*", numbers, ranges (1-5), steps (* /5, 1-5/2), and lists (1,3,5).
 *
 * Does NOT support @yearly/@monthly/@weekly/@daily/@hourly aliases or
 * 6-field (seconds) expressions. Use intervalMs for sub-minute precision.
 */

type CronField = {
	values: Set<number>;
};

function parseField(field: string, min: number, max: number): CronField {
	const values = new Set<number>();

	for (const rawPart of field.split(",")) {
		const part = rawPart.trim();

		if (part.length === 0) {
			throw new Error(`Empty value in cron field "${field}".`);
		}

		if (part === "*") {
			for (let i = min; i <= max; i++) values.add(i);
			continue;
		}

		const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
		if (stepMatch) {
			const [, range, stepStr] = stepMatch;
			const step = Number(stepStr);

			// Bug fix: step=0 would cause an infinite loop in the for-loop below
			if (step <= 0) {
				throw new Error(
					`Invalid step value "${stepStr}" in cron field "${field}": step must be >= 1.`,
				);
			}

			const rangePart = range ?? "*";
			const [start, end] =
				rangePart === "*"
					? [min, max]
					: rangePart.includes("-")
						? (rangePart.split("-").map(Number) as [number, number])
						: [Number(rangePart), Number(rangePart)];

			if (
				!Number.isInteger(start) ||
				!Number.isInteger(end) ||
				start < min ||
				end > max ||
				start > end
			) {
				throw new Error(
					`Invalid stepped range "${rangePart}" in cron field "${field}": must be within [${min}-${max}].`,
				);
			}

			for (let i = start; i <= end; i += step) {
				values.add(i);
			}
			continue;
		}

		const rangeMatch = part.match(/^(\d+)-(\d+)$/);
		if (rangeMatch) {
			const start = Number(rangeMatch[1]);
			const end = Number(rangeMatch[2]);

			// Bug fix: out-of-range ranges were silently ignored, task would never fire
			if (start < min || end > max || start > end) {
				throw new Error(
					`Invalid range "${part}" in cron field "${field}": must be within [${min}-${max}].`,
				);
			}

			for (let i = start; i <= end; i++) values.add(i);
			continue;
		}

		if (/^\d+$/.test(part)) {
			const num = Number(part);

			if (!Number.isInteger(num) || num < min || num > max) {
				throw new Error(
					`Value ${num} is out of range [${min}-${max}] in cron field "${field}".`,
				);
			}

			values.add(num);
			continue;
		}

		throw new Error(`Invalid token "${part}" in cron field "${field}".`);
	}

	return { values };
}

export type ParsedCron = {
	minute: CronField;
	hour: CronField;
	dom: CronField; // day of month
	month: CronField;
	dow: CronField; // day of week
};

export function parseCron(expression: string): ParsedCron {
	const parts = expression.trim().split(/\s+/);

	if (parts.length !== 5) {
		throw new Error(
			`Invalid cron expression "${expression}": expected 5 fields, got ${parts.length}.`,
		);
	}

	const [minute, hour, dom, month, dow] = parts as [
		string,
		string,
		string,
		string,
		string,
	];

	return {
		minute: parseField(minute, 0, 59),
		hour: parseField(hour, 0, 23),
		dom: parseField(dom, 1, 31),
		month: parseField(month, 1, 12),
		dow: parseField(dow, 0, 6),
	};
}

/**
 * Returns the number of milliseconds until the next tick of a cron expression.
 *
 * Uses a skip-ahead strategy instead of iterating minute-by-minute.
 * For sparse expressions like "0 0 1 1 *" (once a year), the old approach
 * iterated up to 525,960 times per reschedule. Now:
 *   - month/dom/dow mismatch → jump to midnight of the next day  (O(366) worst case)
 *   - hour mismatch          → jump to the next hour             (O(24) per day)
 *   - minute mismatch        → advance one minute                (O(60) per hour)
 */
export function msUntilNextCronTick(
	parsed: ParsedCron,
	from: Date = new Date(),
): number {
	// Start from the next whole minute
	const candidate = new Date(from);
	candidate.setSeconds(0, 0);
	candidate.setMinutes(candidate.getMinutes() + 1);

	const limit = new Date(from.getTime() + 366 * 24 * 60 * 60 * 1000);

	while (candidate < limit) {
		// Month, dom, or dow mismatch — jump to midnight of the next day
		if (
			!parsed.month.values.has(candidate.getMonth() + 1) ||
			!parsed.dom.values.has(candidate.getDate()) ||
			!parsed.dow.values.has(candidate.getDay())
		) {
			candidate.setDate(candidate.getDate() + 1);
			candidate.setHours(0, 0, 0, 0);
			continue;
		}

		// Hour mismatch — jump to the next hour
		if (!parsed.hour.values.has(candidate.getHours())) {
			candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
			continue;
		}

		// Matching day + hour — check minute
		if (parsed.minute.values.has(candidate.getMinutes())) {
			return candidate.getTime() - from.getTime();
		}

		candidate.setMinutes(candidate.getMinutes() + 1);
	}

	throw new Error(
		`Could not find next tick for cron expression within 366 days.`,
	);
}
