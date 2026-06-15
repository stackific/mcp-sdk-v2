[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TasksExtensionCapabilitySchema

# Variable: TasksExtensionCapabilitySchema

> `const` **TasksExtensionCapabilitySchema**: `ZodRecord`\<`ZodString`, `ZodUnknown`\>

Defined in: [protocol/tasks.ts:110](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L110)

The settings value associated with [TASKS\_EXTENSION\_ID](TASKS_EXTENSION_ID.md) in an extensions
capability map. (§25.2, R-25.2-a, R-25.2-b)

This extension defines no settings, so the canonical value is the empty object
`{}`. Receivers MUST ignore unrecognized members of the settings object, so the
schema is a permissive record (`.passthrough()` equivalent for `z.record`):
unknown members are accepted and preserved, never rejected. (R-25.2-b)
