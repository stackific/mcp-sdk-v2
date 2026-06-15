[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResponseShape

# Variable: ResponseShape

> `const` **ResponseShape**: `object`

Defined in: [transport/http/responses.ts:96](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L96)

The two ways a server MAY answer a JSON-RPC *request* body. Exactly one is
chosen per request; both succeed with HTTP `200 OK`. (R-9.6-a)

## Type Declaration

### SINGLE\_JSON

> `readonly` **SINGLE\_JSON**: `"single-json"` = `'single-json'`

One HTTP `200 OK` + `application/json` carrying a single JSON-RPC response. (§9.6.1)

### EVENT\_STREAM

> `readonly` **EVENT\_STREAM**: `"event-stream"` = `'event-stream'`

HTTP `200 OK` + `text/event-stream`, a request-scoped SSE stream. (§9.6.2)
