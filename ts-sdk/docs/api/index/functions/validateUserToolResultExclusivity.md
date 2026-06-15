[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateUserToolResultExclusivity

# Function: validateUserToolResultExclusivity()

> **validateUserToolResultExclusivity**(`message`): `object`

Defined in: [protocol/sampling.ts:661](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L661)

Validates the §21.2.7 content constraint on a single `user` message: when a
`user` message contains any `tool_result` block, it MUST contain ONLY
`tool_result` blocks — mixing with text/image/audio (or any other type) is
NOT allowed. (R-21.2.7-a)

Returns `{ ok: true }` for any non-`user` message, a `user` message with no
tool results, or a `user` message of only tool results. Returns
`{ ok: false, reason }` for a mixed `user` message.

## Parameters

### message

`objectOutputType`

## Returns

`object`

### ok

> **ok**: `boolean`

### reason?

> `optional` **reason?**: `string`
