import { describe, expect, test } from "bun:test";
import {
	msUntilNextCronTick,
	parseCron,
} from "../src/handler/tasks/functions/parseCron";

describe("parseCron", () => {
	test("rejects stepped values outside the field range", () => {
		expect(() => parseCron("60/5 * * * *")).toThrow(
			/Invalid stepped range/,
		);
	});

	test("rejects invalid tokens instead of creating an empty schedule", () => {
		expect(() => parseCron("wat * * * *")).toThrow(/Invalid token/);
	});

	test("rejects empty list values", () => {
		expect(() => parseCron("1,,2 * * * *")).toThrow(/Empty value/);
	});
});

describe("parseCron extensions", () => {
	test("expands aliases", () => {
		const daily = parseCron("@daily");
		expect([...daily.minute.values]).toEqual([0]);
		expect([...daily.hour.values]).toEqual([0]);
	});

	test("accepts month and weekday names", () => {
		const parsed = parseCron("0 9 * jan,Mar MON-FRI");
		expect([...parsed.month.values]).toEqual([1, 3]);
		expect([...parsed.dow.values].sort()).toEqual([1, 2, 3, 4, 5]);
	});

	test("treats 7 as Sunday", () => {
		expect([...parseCron("0 0 * * 7").dow.values]).toEqual([0]);
		expect(parseCron("0 0 * * 0-7").dow.wildcard).toBe(true);
	});

	test("a single-value step runs from that value to the max", () => {
		expect([...parseCron("5/15 * * * *").minute.values]).toEqual([
			5, 20, 35, 50,
		]);
	});
});

describe("msUntilNextCronTick", () => {
	// Wednesday 2026-01-14 10:30:15 local time
	const from = new Date(2026, 0, 14, 10, 30, 15);

	function next(expr: string): Date {
		return new Date(from.getTime() + msUntilNextCronTick(parseCron(expr), from));
	}

	test("finds the next matching minute in the current hour", () => {
		expect(next("45 * * * *")).toEqual(new Date(2026, 0, 14, 10, 45));
	});

	test("never returns the current minute", () => {
		expect(next("30 10 * * *")).toEqual(new Date(2026, 0, 15, 10, 30));
	});

	test("rolls over to the next day and month", () => {
		expect(next("0 0 1 * *")).toEqual(new Date(2026, 1, 1, 0, 0));
	});

	test("matches day-of-month OR day-of-week when both are restricted", () => {
		// The 20th, or any Friday — Friday the 16th comes first.
		expect(next("0 12 20 * FRI")).toEqual(new Date(2026, 0, 16, 12, 0));
	});

	test("handles yearly schedules", () => {
		expect(next("@yearly")).toEqual(new Date(2027, 0, 1, 0, 0));
	});

	test("finds leap days more than a year away", () => {
		expect(next("0 0 29 2 *")).toEqual(new Date(2028, 1, 29, 0, 0));
	});

	test("rejects days that never occur", () => {
		expect(() => parseCron("0 0 31 2 *")).toThrow(/never occurs/);
		expect(() => parseCron("0 0 31 4,6 *")).toThrow(/never occurs/);
	});
});
