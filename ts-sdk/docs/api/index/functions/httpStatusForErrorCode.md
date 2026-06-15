[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / httpStatusForErrorCode

# Function: httpStatusForErrorCode()

> **httpStatusForErrorCode**(`code`): `400` \| `404`

Defined in: [transport/http/responses.ts:427](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L427)

Maps a JSON-RPC error `code` to the HTTP status it rides on. (§9.7)

  - `-32601` (`Method not found`)             → `404 Not Found` (R-9.7-b)
  - `-32700`/`-32600`/`-32602`                → `400 Bad Request`
  - `-32001`/`-32003`/`-32004` (MCP codes)    → `400 Bad Request`
  - any other code (e.g. `-32603` internal)   → `400 Bad Request` as the
    transport-boundary default for a JSON-RPC error body.

`200`/`202`/`403`/`405` are not error-body conditions and are produced by
their dedicated builders, not by this code-driven map.

## Parameters

### code

`number`

## Returns

`400` \| `404`
