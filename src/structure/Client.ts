export type HandlerClient = {
	on: (eventName: any, listener: (...args: any[]) => unknown) => unknown;
	once: (eventName: any, listener: (...args: any[]) => unknown) => unknown;
	off: (eventName: any, listener: (...args: any[]) => unknown) => unknown;
	db?: any;
};

export type ClientClass = HandlerClient;
