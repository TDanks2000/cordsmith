export class UserError extends Error {
	public readonly ephemeral: boolean;

	constructor(message: string, options?: { ephemeral?: boolean }) {
		super(message);
		this.name = "UserError";
		this.ephemeral = options?.ephemeral ?? true;
	}
}

export function isUserError(err: unknown): err is UserError {
	return err instanceof UserError;
}
