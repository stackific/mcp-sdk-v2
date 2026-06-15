[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUnsupportedProtocolVersionError

# Function: buildUnsupportedProtocolVersionError()

> **buildUnsupportedProtocolVersionError**(`requested`, `supported`): [`UnsupportedProtocolVersionError`](../interfaces/UnsupportedProtocolVersionError.md)

Defined in: [protocol/discovery.ts:194](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L194)

Builds the `UnsupportedProtocolVersion` (-32004) error a server returns when
the requested revision is not in its supported set. (R-5.3.1-g)

Both `data.supported` and `data.requested` are REQUIRED (§5.5): the former
still advertises the server's revisions so the client can recover; the latter
echoes the rejected revision.

## Parameters

### requested

`string`

The revision the client declared (and the server rejected).

### supported

readonly `string`[]

The revisions the server accepts.

## Returns

[`UnsupportedProtocolVersionError`](../interfaces/UnsupportedProtocolVersionError.md)
