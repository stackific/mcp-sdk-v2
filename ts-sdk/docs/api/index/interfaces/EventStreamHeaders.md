[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / EventStreamHeaders

# Interface: EventStreamHeaders

Defined in: [transport/http/responses.ts:154](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L154)

The response headers that open an event-stream (SSE) response.

## Properties

### Content-Type

> **Content-Type**: `"text/event-stream"`

Defined in: [transport/http/responses.ts:155](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L155)

***

### X-Accel-Buffering?

> `optional` **X-Accel-Buffering?**: `"no"`

Defined in: [transport/http/responses.ts:157](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L157)

Present by default (SHOULD); set `includeAccelBuffering: false` to omit. (R-9.6.2-g)
