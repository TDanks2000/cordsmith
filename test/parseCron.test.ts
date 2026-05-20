import { describe, expect, test } from "bun:test";
import { parseCron } from "../src/handler/tasks/functions/parseCron";

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
