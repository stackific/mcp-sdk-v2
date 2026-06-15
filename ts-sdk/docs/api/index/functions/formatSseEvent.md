[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / formatSseEvent

# Function: formatSseEvent()

> **formatSseEvent**(`message`): `string`

Defined in: [transport/http/responses.ts:189](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L189)

Serializes one JSON-RPC message as a single SSE event: a `data:` field
carrying the message as JSON, terminated by a blank line. (R-9.6.2-a)

The result ends with `\n\n`; the trailing blank line is the event terminator
required by the `text/event-stream` framing.

## Parameters

### message

`unknown`

One JSON-RPC notification or response object.

## Returns

`string`
