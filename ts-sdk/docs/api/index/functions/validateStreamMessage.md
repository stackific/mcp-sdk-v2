[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateStreamMessage

# Function: validateStreamMessage()

> **validateStreamMessage**(`message`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [transport/http/responses.ts:206](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L206)

Validates that a message a server intends to write on the event stream is
allowed there. (R-9.6.2-c, R-9.6.2-d)

Permitted: request-scoped *notifications* (a `notifications/*` whose `params`
relate to the originating request) and the final *response* (an object with
`id` plus `result` or `error`). Forbidden: an independent JSON-RPC *request*
(an object carrying both `method` and `id`), which the server MUST NOT send on
this stream.

## Parameters

### message

`unknown`

The candidate message object.

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

`{ ok: true }` when allowed, otherwise `{ ok: false, reason }`.
