[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TASK\_FORBIDDEN\_NOTIFICATION\_METHODS

# Variable: TASK\_FORBIDDEN\_NOTIFICATION\_METHODS

> `const` **TASK\_FORBIDDEN\_NOTIFICATION\_METHODS**: readonly \[`"notifications/progress"`, `"notifications/message"`, `"notifications/cancelled"`\]

Defined in: [protocol/tasks-lifecycle.ts:621](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L621)

The notification methods that MUST NOT be used to convey task state:
`notifications/progress`, `notifications/message`, and `notifications/cancelled`.
(§25.9, §25.10, R-25.9-a, R-25.10-g)

  - progress / message — task state is conveyed ONLY via `tasks/get` and
    `notifications/tasks` (R-25.10-g, AC-40.36);
  - cancelled — `tasks/cancel` is the ONLY task-cancellation mechanism; the
    general `notifications/cancelled` MUST NOT be used (R-25.9-a, AC-40.23).

Reuses the canonical method-name constants from S22 (progress / cancelled) and
S23 (logging) rather than re-typing the literals.
