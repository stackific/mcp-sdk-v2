[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / deriveExtensionNamespace

# Function: deriveExtensionNamespace()

> **deriveExtensionNamespace**(`identifier`): `string` \| `undefined`

Defined in: [protocol/extension-mechanism.ts:253](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L253)

Derives the method namespace prefix an extension owns from its identifier's
NAME segment. (R-24.5-b)

The §24.5 examples show the Tasks extension (`io.modelcontextprotocol/tasks`)
defining methods such as `tasks/get` — i.e. the namespace is the identifier's
extension-name followed by `/`. This derives `"tasks/"` from
`"io.modelcontextprotocol/tasks"` so a definition can both *mint* and
*recognize* its own method strings consistently.

Returns `undefined` when `identifier` is not a well-formed extension identifier
or its name is empty (an empty name yields no usable namespace).

## Parameters

### identifier

`string`

## Returns

`string` \| `undefined`
