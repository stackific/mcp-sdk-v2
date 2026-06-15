[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertServerIsolation

# Function: assertServerIsolation()

> **assertServerIsolation**(`options`): [`ServerIsolationValidation`](../type-aliases/ServerIsolationValidation.md)

Defined in: [protocol/security.ts:670](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L670)

Asserts the §28.4 server-isolation invariant for a flow the host is about to
perform: a server receives only host-elected context, never another server's
requests/results/context/credentials. (§28.4, R-28.4-a, R-28.4-d, R-28.4-e,
R-28.4-f; AC-44.11)

Returns `ok: false` when the destination server is not the one the context
originated from (cross-server relay) or when the context was not host-elected —
both of which the host MUST NOT do. One server can never observe another's data
(R-28.4-e); the host is the only boundary and never bridges two servers.

## Parameters

### options

#### sourceServerId?

`string`

The server the context/credential came from, if any.

#### destinationServerId

`string`

The server the host is about to send it to.

#### hostElected

`boolean`

`true` when the host deliberately elected to share
  this context with the destination (R-28.4-a).

## Returns

[`ServerIsolationValidation`](../type-aliases/ServerIsolationValidation.md)
