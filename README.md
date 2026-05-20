# Cordsmith

Cordsmith is a Bun-first Discord.js handler library extracted from the T+C bot.
It provides handlers for slash commands, context menus, events, scheduled tasks,
shared preconditions, command registration caching, and component custom IDs.

## Install locally with Bun

```sh
bun add cordsmith@file:../cordsmith
```

## Basic usage

```ts
import { HandlerManager } from "cordsmith";

const handlers = new HandlerManager({
	client,
	commands: {
		commandsDir: "src/commands",
		extensions: [".ts", ".js"],
		register: {
			token: Bun.env.DISCORD_TOKEN!,
			applicationId: Bun.env.DISCORD_APPLICATION_ID!,
			where: { mode: "global" },
		},
	},
	events: {
		eventsDir: "src/events",
		extensions: [".ts", ".js"],
	},
});

await handlers.init();
```

## Production Notes

- Keep module directories scoped to trusted command, event, context menu, and task code. Cordsmith validates extensions and skips files that resolve outside the configured root.
- Use `makeCustomId()` for component IDs. It enforces Discord's 100 character limit and rejects segments that would break routing.
- `HandlerManager` registers slash commands and context menus in one payload per Discord scope, so enabling both does not overwrite either set.
- `HandlerManager.shutdown()` detaches event, command, and context menu listeners and cancels scheduled tasks for clean restarts.
