/**
 * Lightweight cron expression parser.
 *
 * Supports standard 5-field cron: "min hour dom mon dow"
 * Fields support: "*", numbers, ranges (1-5), steps (* /5, 1-5/2), lists
 * (1,3,5), month names (JAN-DEC), weekday names (SUN-SAT), and 7 as Sunday.
 *
 * Also supports the aliases @yearly, @annually, @monthly, @weekly, @daily,
 * @midnight and @hourly.
 *
 * As in standard cron, when both day-of-month and day-of-week are restricted
 * (neither is "*"), a day matches if EITHER field matches.
 *
 * Does NOT support 6-field (seconds) expressions. Use intervalMs for
 * sub-minute precision.
 */

type CronField = {
	values: Set<number>;
	/** True when the field covers its whole range (e.g. "*"), i.e. unrestricted. */
	wildcard: boolean;
};

const ALIASES: Record<string, string> = {
	"@yearly": "0 0 1 1 *",
	"@annually": "0 0 1 1 *",
	"@monthly": "0 0 1 * *",
	"@weekly": "0 0 * * 0",
	"@daily": "0 0 * * *",
	"@midnight": "0 0 * * *",
	"@hourly": "0 * * * *",
};

const MONTH_NAMES = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC",
];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Upper bound for the next-tick search. Leap days can be up to 8 years apart
 * (e.g. 2096 → 2104), so "0 0 29 2 *" needs more than a single year.
 */
const SEARCH_LIMIT_MS = 8 * 366 * 24 * 60 * 60 * 1000;

/** Replace three-letter names with their numeric values, e.g. "MON-FRI" → "1-5". */
function replaceNames(field: string, names: string[], offset: number): string {
	return field.replace(/[A-Za-z]{3}/g, (token) => {
		const index = names.indexOf(token.toUpperCase());
		return index === -1 ? token : String(index + offset);
	});
}

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

			// step=0 would cause an infinite loop in the for-loop below
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
						: // "5/15" means "starting at 5, every 15" up to the max
							[Number(rangePart), max];

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

			if (num < min || num > max) {
				throw new Error(
					`Value ${num} is out of range [${min}-${max}] in cron field "${field}".`,
				);
			}

			values.add(num);
			continue;
		}

		throw new Error(`Invalid token "${part}" in cron field "${field}".`);
	}

	return { values, wildcard: values.size === max - min + 1 };
}

export type ParsedCron = {
	minute: CronField;
	hour: CronField;
	dom: CronField; // day of month
	month: CronField;
	dow: CronField; // day of week (0-6, Sunday = 0)
};

export function parseCron(expression: string): ParsedCron {
	const trimmed = expression.trim();
	const expanded = ALIASES[trimmed.toLowerCase()] ?? trimmed;
	const parts = expanded.split(/\s+/);

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

	// Parse day-of-week over 0-7 so both 0 and 7 mean Sunday, then fold 7 → 0.
	const dowField = parseField(replaceNames(dow, DAY_NAMES, 0), 0, 7);
	if (dowField.values.delete(7)) dowField.values.add(0);
	dowField.wildcard = dowField.values.size === 7;

	const parsed: ParsedCron = {
		minute: parseField(minute, 0, 59),
		hour: parseField(hour, 0, 23),
		dom: parseField(dom, 1, 31),
		month: parseField(replaceNames(month, MONTH_NAMES, 1), 1, 12),
		dow: dowField,
	};

	// Reject schedules that can never fire, e.g. "0 0 31 2 *" (Feb 31).
	// Only possible when day-of-week is unrestricted (otherwise it can match).
	if (parsed.dow.wildcard) {
		const possible = [...parsed.month.values].some((m) =>
			[...parsed.dom.values].some((d) => d <= MAX_DAYS_IN_MONTH[m - 1]!),
		);

		if (!possible) {
			throw new Error(
				`Invalid cron expression "${expression}": that day never occurs in the selected month(s).`,
			);
		}
	}

	return parsed;
}

function dayMatches(parsed: ParsedCron, date: Date): boolean {
	if (!parsed.month.values.has(date.getMonth() + 1)) return false;

	const domMatch = parsed.dom.values.has(date.getDate());
	const dowMatch = parsed.dow.values.has(date.getDay());

	// Standard cron: if both day fields are restricted, either may match.
	if (!parsed.dom.wildcard && !parsed.dow.wildcard) return domMatch || dowMatch;
	return domMatch && dowMatch;
}

/**
 * Returns the number of milliseconds until the next tick of a cron expression.
 *
 * Uses a skip-ahead strategy instead of iterating minute-by-minute:
 *   - day mismatch    → jump to midnight of the next day (O(days) worst case)
 *   - hour mismatch   → jump to the next hour            (O(24) per day)
 *   - minute matching → scan the remaining minutes of the hour without
 *                       touching the Date object
 */
export function msUntilNextCronTick(
	parsed: ParsedCron,
	from: Date = new Date(),
): number {
	// Start from the next whole minute
	const candidate = new Date(from);
	candidate.setSeconds(0, 0);
	candidate.setMinutes(candidate.getMinutes() + 1);

	const limit = from.getTime() + SEARCH_LIMIT_MS;

	while (candidate.getTime() < limit) {
		if (!dayMatches(parsed, candidate)) {
			candidate.setDate(candidate.getDate() + 1);
			candidate.setHours(0, 0, 0, 0);
			continue;
		}

		if (!parsed.hour.values.has(candidate.getHours())) {
			candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
			continue;
		}

		let minute = candidate.getMinutes();
		while (minute < 60 && !parsed.minute.values.has(minute)) minute++;

		if (minute < 60) {
			candidate.setMinutes(minute);
			return candidate.getTime() - from.getTime();
		}

		candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
	}

	throw new Error(
		`Could not find next tick for cron expression within 8 years.`,
	);
}
