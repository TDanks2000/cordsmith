type LogContext =
	| Record<string, string | number | boolean | null | undefined>
	| undefined;

export type Logger = {
	info: (message: string, context?: LogContext) => void;
	warn: (message: string, context?: LogContext) => void;
	error: (message: string, error?: unknown, context?: LogContext) => void;
	debug: (message: string, context?: LogContext) => void;
};

function timestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function formatContext(context: LogContext): string {
	if (!context) return "";

	const entries = Object.entries(context).filter(([, value]) => value !== undefined);
	if (entries.length === 0) return "";

	return ` ${entries.map(([key, value]) => `${key}=${String(value)}`).join(" ")}`;
}

function normalizeError(error: unknown): { message: string; stack?: string } {
	if (error instanceof Error) {
		return { message: error.message, stack: error.stack };
	}

	try {
		return { message: JSON.stringify(error) };
	} catch {
		return { message: String(error) };
	}
}

const debugEnabled = (): boolean =>
	String(Bun.env.LOG_LEVEL ?? "").toLowerCase() === "debug";

export const logger: Logger = {
	info(message, context) {
		console.log(`${timestamp()} [INFO] ${message}${formatContext(context)}`);
	},

	warn(message, context) {
		console.warn(`${timestamp()} [WARN] ${message}${formatContext(context)}`);
	},

	error(message, error, context) {
		console.error(`${timestamp()} [ERROR] ${message}${formatContext(context)}`);

		if (error === undefined) return;

		const normalized = normalizeError(error);
		console.error(normalized.message);
		if (normalized.stack) console.error(normalized.stack);
	},

	debug(message, context) {
		if (!debugEnabled()) return;
		console.log(`${timestamp()} [DEBUG] ${message}${formatContext(context)}`);
	},
};
