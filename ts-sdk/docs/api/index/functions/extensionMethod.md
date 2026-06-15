[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / extensionMethod

# Function: extensionMethod()

> **extensionMethod**(`identifier`, `member`): `string`

Defined in: [protocol/extension-mechanism.ts:283](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L283)

Builds a namespaced method string for an extension from its identifier and a
member name (e.g. `("io.modelcontextprotocol/tasks", "get") → "tasks/get"`).
(R-24.5-b)

## Parameters

### identifier

`string`

### member

`string`

## Returns

`string`

## Throws

when `identifier` yields no namespace (malformed or
  empty-named) or `member` is empty.
