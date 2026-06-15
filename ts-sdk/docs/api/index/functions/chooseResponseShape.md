[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / chooseResponseShape

# Function: chooseResponseShape()

> **chooseResponseShape**(`emitsRequestScopedNotifications`): [`ResponseShape`](../type-aliases/ResponseShape.md)

Defined in: [transport/http/responses.ts:119](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L119)

Picks the response shape for a JSON-RPC request body. (R-9.6-a, R-9.6.1-a,
R-9.6.2-a)

A server uses the single-JSON shape when it can produce the response without
emitting any request-scoped notifications, and the event-stream shape when it
intends to emit request-scoped notifications (progress, logging) before the
final response. The choice is per request and is a server decision — this
helper encodes the spec's "emits request-scoped notifications" criterion.

## Parameters

### emitsRequestScopedNotifications

`boolean`

Whether the server will stream any
  request-scoped notification before the final response.

## Returns

[`ResponseShape`](../type-aliases/ResponseShape.md)
