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

`HandlerManager` imports every handler's modules concurrently, then attaches
listeners in a fixed order (events → commands → context menus) and starts tasks last.

## Module conventions

- **Commands / context menus / tasks** can use a default export or named exports:

  ```ts
  export const data = new SlashCommandBuilder().setName("ping").setDescription("Pong!");
  export async function execute({ interaction }) {
  	await interaction.reply("Pong!");
  }
  ```

- **Events** are named by folder or by file: `events/messageCreate/log.ts` and
  `events/clientReady.ts` both work. Use `defineEvent<"messageCreate">({ ... })` for typed `args`.
- **Tasks** take `intervalMs` or `cron`. Cron supports standard 5-field syntax,
  `@hourly`/`@daily`/`@weekly`/`@monthly`/`@yearly`, month/day names (`MON-FRI`, `JAN`),
  and `7` for Sunday. Invalid expressions fail at startup with the file path.
  Use `taskHandler.run(name)` to trigger a task manually.

## Preconditions

Built-in guards are enabled by `meta` flags (`ownerOnly`, `guildOnly`, `dmOnly`,
`userPermissions`, `botPermissions`, `cooldownMs`). Custom preconditions are listed in
`meta.preconditions` and registered with `registerPrecondition()`.

- Each command's precondition chain is resolved once; commands without guards skip the step entirely.
- A reference to an unregistered precondition fails at `init()`, not on first use.
- Cooldowns run last, so a user rejected by any other check is not put on cooldown.
- `botPermissions` uses the permissions Discord sends with the interaction, so no member/channel cache is required.

## Logging

```ts
import { setLogger } from "cordsmith";

setLogger({ info: (msg) => pino.info(msg), error: (msg, err) => pino.error(err, msg) });
```

## Production Notes

- Keep module directories scoped to trusted command, event, context menu, and task code. Cordsmith validates extensions and skips files that resolve outside the configured root.
- Use `makeCustomId()` for component IDs. It enforces Discord's 100 character limit and rejects segments that would break routing.
- `HandlerManager` registers slash commands and context menus in one payload per Discord scope, so enabling both does not overwrite either set.
- `HandlerManager.shutdown()` detaches event, command, and context menu listeners and cancels scheduled tasks for clean restarts. On SIGINT/SIGTERM it also calls `client.destroy()` before exiting.
- Interaction listeners never let errors escape (a failed reply to an expired interaction is logged, not thrown), so one bad interaction can't crash the process with an unhandled rejection.
- Replies use `MessageFlags.Ephemeral` rather than the deprecated `ephemeral` option.
- Registration payloads are sorted by code point (not locale), so the cache hash is identical on every machine. Multi-guild registration runs concurrently.
