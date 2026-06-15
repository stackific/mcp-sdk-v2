[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / negotiateRevision

# Function: negotiateRevision()

> **negotiateRevision**(`clientPreference`, `serverSupported`): [`RevisionNegotiationResult`](../type-aliases/RevisionNegotiationResult.md)

Defined in: [protocol/negotiation.ts:101](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L101)

Selects the highest mutually supported protocol revision. (§5.4, R-5.4-b)

"Highest" means the first revision in the client's own ordered preference
list that also appears in the server's set — matching is exact (S07), never
lexical/chronological. When the intersection is empty the result is
`{ ok: false, reason: 'no-mutual-revision' }`: the client MUST NOT fabricate a
revision (R-5.4-c) and SHOULD surface an incompatibility (R-5.4-d) via
[IncompatibleProtocolError](../classes/IncompatibleProtocolError.md).

## Parameters

### clientPreference

readonly `string`[]

The client's acceptable revisions, most-preferred first.

### serverSupported

readonly `string`[]

The server's advertised revisions (order ignored).

## Returns

[`RevisionNegotiationResult`](../type-aliases/RevisionNegotiationResult.md)
