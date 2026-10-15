export type HandlerClient = {
	on: (eventName: any, listener: (...args: any[]) => unknown) => unknown;
	once: (eventName: any, listener: (...args: any[]) => unknown) => unknown;
	off: (eventName: any, listener: (...args: any[]) => unknown) => unknown;
	/** Called on SIGINT/SIGTERM by HandlerManager, if present. */
	destroy?: () => unknown;
	db?: any;
};

export type ClientClass = HandlerClient;
