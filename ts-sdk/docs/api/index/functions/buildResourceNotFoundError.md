[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildResourceNotFoundError

# Function: buildResourceNotFoundError()

> **buildResourceNotFoundError**(`uri`, `message?`): [`ResourceNotFoundError`](../interfaces/ResourceNotFoundError.md)

Defined in: [protocol/resources-read.ts:147](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L147)

Builds the JSON-RPC error a server returns when a requested `uri` is not a
readable resource. The `code` is the modern `-32602` (Invalid params); the
offending `uri` is placed in `data.uri` so the client can correlate the
failure. A server MUST return this error — NOT an empty `contents` result —
to signal non-existence. (§17.5, §17.6, R-17.5-aa, R-17.6-a, R-17.6-b)

## Parameters

### uri

`string`

The offending resource URI (echoed into `data.uri`).

### message?

`string` = `'Resource not found'`

OPTIONAL human-readable message (defaults to "Resource not found").

## Returns

[`ResourceNotFoundError`](../interfaces/ResourceNotFoundError.md)
