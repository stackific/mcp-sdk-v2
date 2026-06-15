[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / reselectAfterUnsupportedVersion

# Function: reselectAfterUnsupportedVersion()

> **reselectAfterUnsupportedVersion**(`error`, `clientPreference`): [`RevisionNegotiationResult`](../type-aliases/RevisionNegotiationResult.md)

Defined in: [protocol/negotiation.ts:155](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L155)

Reacts to an `UnsupportedProtocolVersion` (`-32004`) error by re-selecting a
revision from the error's authoritative `data.supported` set. (R-5.5-h)

Returns `{ ok: true, selected }` to retry the original request with `selected`
declared in `io.modelcontextprotocol/protocolVersion` (and the matching
`MCP-Protocol-Version` header on HTTP). Returns `{ ok: false }` when no
mutually supported revision exists — the client MUST NOT retry indefinitely
(R-5.5-i) and SHOULD surface an incompatibility (R-5.5-j); because this is a
pure re-selection over the server's set, an empty result is terminal.

## Parameters

### error

[`UnsupportedProtocolVersionError`](../interfaces/UnsupportedProtocolVersionError.md)

The `-32004` error object (its `data.supported` is used).

### clientPreference

readonly `string`[]

The client's acceptable revisions, most-preferred first.

## Returns

[`RevisionNegotiationResult`](../type-aliases/RevisionNegotiationResult.md)
