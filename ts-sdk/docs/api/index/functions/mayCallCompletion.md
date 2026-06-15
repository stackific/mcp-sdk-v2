[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayCallCompletion

# Function: mayCallCompletion()

> **mayCallCompletion**(`serverCaps`): `boolean`

Defined in: [protocol/completion.ts:160](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L160)

Returns `true` when a client MAY send `completion/complete` given the server's
declared capabilities. A client MUST NOT send it to a server that has not
declared `completions`. (R-19.1-c, AC-29.2)

Delegates to `mayClientInvoke` (S10), whose `SERVER_METHOD_CAPABILITY` map
already gates `completion/complete` on the `completions` capability.

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
