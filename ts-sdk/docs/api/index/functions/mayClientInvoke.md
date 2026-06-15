[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayClientInvoke

# Function: mayClientInvoke()

> **mayClientInvoke**(`method`, `serverCaps`): `boolean`

Defined in: [protocol/capability-negotiation.ts:263](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L263)

Returns `true` when a client MAY invoke `method` given the server's declared
capabilities. (R-6.3-e, R-6.4-f, R-6.4-g)

An ungated (core) method is always invocable; a gated method requires the
governing capability to be declared in `serverCaps`.

## Parameters

### method

`string`

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
