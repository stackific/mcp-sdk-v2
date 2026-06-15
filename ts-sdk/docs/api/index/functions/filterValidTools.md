[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / filterValidTools

# Function: filterValidTools()

> **filterValidTools**(`tools`): [`FilterToolsResult`](../interfaces/FilterToolsResult.md)

Defined in: [transport/http/param-headers.ts:190](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L190)

Filters a `tools/list` result, excluding only tools whose `x-mcp-header`
annotations are invalid and keeping all valid tools usable. (R-9.5.1-i,
R-9.5.1-j) The returned `warnings` name each rejected tool and the reason so
the caller can log them. (R-9.5.1-k)

Clients on non-HTTP transports MAY skip this entirely (R-9.5.1-l) — it is only
invoked by the Streamable HTTP client.

## Parameters

### tools

readonly [`ToolDefinition`](../interfaces/ToolDefinition.md)[]

## Returns

[`FilterToolsResult`](../interfaces/FilterToolsResult.md)
