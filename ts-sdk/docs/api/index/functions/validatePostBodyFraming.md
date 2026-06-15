[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validatePostBodyFraming

# Function: validatePostBodyFraming()

> **validatePostBodyFraming**(`body`): [`BodyFramingResult`](../type-aliases/BodyFramingResult.md)

Defined in: [transport/http/headers.ts:177](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L177)

Validates that a POST body is exactly one JSON-RPC request or notification —
never a batch (array), never a response, never malformed. (R-9.1-b, R-9.2-c,
R-9.2-d, R-9.2-e)

UTF-8 well-formedness (R-9.1-a) is enforced upstream by the transport decode
layer (`decodeMessageUnit`, S12); this operates on the already-parsed value.

## Parameters

### body

`unknown`

## Returns

[`BodyFramingResult`](../type-aliases/BodyFramingResult.md)
