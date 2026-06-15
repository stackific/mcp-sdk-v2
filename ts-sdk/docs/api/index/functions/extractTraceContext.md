[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / extractTraceContext

# Function: extractTraceContext()

> **extractTraceContext**(`meta`): `Partial`\<`Record`\<[`TraceContextKey`](../type-aliases/TraceContextKey.md), `string`\>\>

Defined in: [protocol/logging.ts:259](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L259)

Extracts only the trace-context keys from `meta`, returning an object that
contains at most `traceparent`, `tracestate`, and `baggage`.

Receivers that do not participate in tracing can safely ignore the returned
object. (R-15.4.2-g)

## Parameters

### meta

`Record`\<`string`, `unknown`\>

## Returns

`Partial`\<`Record`\<[`TraceContextKey`](../type-aliases/TraceContextKey.md), `string`\>\>
