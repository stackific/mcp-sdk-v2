[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasConsistentInlineOutcome

# Function: hasConsistentInlineOutcome()

> **hasConsistentInlineOutcome**(`task`): `boolean`

Defined in: [protocol/tasks.ts:543](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L543)

Returns `true` when a `DetailedTask` correctly observes the inline-outcome rule
of §25.5: a non-terminal task carries neither `result` nor `error`; a
`completed` task carries `result` (and no `error`); a `failed` task carries
`error` (and no `result`); a `cancelled` task carries neither. (R-25.5-d,
AC-39.16)

The schema-level [DetailedTaskSchema](../variables/DetailedTaskSchema.md) already requires `result` on
`completed` and `error` on `failed`; this additionally rejects a non-terminal
or `cancelled` variant that smuggles a `result`/`error` it must not carry.

## Parameters

### task

`object` & `Record`\<`string`, `unknown`\>

A parsed `DetailedTask` (or any object shaped like one).

## Returns

`boolean`
