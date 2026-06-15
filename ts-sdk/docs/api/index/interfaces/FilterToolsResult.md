[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / FilterToolsResult

# Interface: FilterToolsResult

Defined in: [transport/http/param-headers.ts:175](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L175)

Result of filtering tools: the usable ones plus warnings about rejected ones.

## Properties

### tools

> **tools**: [`ToolDefinition`](ToolDefinition.md)[]

Defined in: [transport/http/param-headers.ts:176](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L176)

***

### warnings

> **warnings**: [`RejectedTool`](RejectedTool.md)[]

Defined in: [transport/http/param-headers.ts:178](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L178)

Rejected tools — the caller SHOULD log each as a warning. (R-9.5.1-k)
