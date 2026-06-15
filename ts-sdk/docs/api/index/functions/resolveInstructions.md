[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveInstructions

# Function: resolveInstructions()

> **resolveInstructions**(`result`): `string` \| `undefined`

Defined in: [protocol/discovery.ts:463](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L463)

Returns the server's `instructions` string, or `undefined` when absent.

When `instructions` is missing the client MUST NOT assume or fabricate any
guidance — this returns `undefined` rather than an empty or default string.
(R-5.3.2-j, AC-08.11)

## Parameters

### result

#### instructions?

`unknown`

## Returns

`string` \| `undefined`
