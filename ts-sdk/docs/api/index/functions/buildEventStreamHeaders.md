[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildEventStreamHeaders

# Function: buildEventStreamHeaders()

> **buildEventStreamHeaders**(`includeAccelBuffering?`): [`EventStreamHeaders`](../interfaces/EventStreamHeaders.md)

Defined in: [transport/http/responses.ts:169](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L169)

Builds the response headers that open an event-stream response: HTTP `200 OK`
with `Content-Type: text/event-stream`, and — by default — the
`X-Accel-Buffering: no` hint so reverse proxies deliver events immediately.
(R-9.6.2-a, R-9.6.2-g)

## Parameters

### includeAccelBuffering?

`boolean` = `true`

Whether to include `X-Accel-Buffering: no`
  (default `true`; the spec SHOULD).

## Returns

[`EventStreamHeaders`](../interfaces/EventStreamHeaders.md)
