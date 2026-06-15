[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DispatchableTool

# Interface: DispatchableTool

Defined in: [protocol/tools-call.ts:428](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L428)

A tool whose schemas are needed to dispatch a `tools/call`. (Subset of S24's `Tool`.)

## Properties

### name

> **name**: `string`

Defined in: [protocol/tools-call.ts:430](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L430)

The tool's `name`.

***

### inputSchema

> **inputSchema**: `unknown`

Defined in: [protocol/tools-call.ts:432](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L432)

The tool's REQUIRED `inputSchema` (root `type: "object"`).

***

### outputSchema?

> `optional` **outputSchema?**: `unknown`

Defined in: [protocol/tools-call.ts:434](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L434)

OPTIONAL `outputSchema` governing `structuredContent` conformance.
