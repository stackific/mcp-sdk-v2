[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / processDiscoverRequest

# Function: processDiscoverRequest()

> **processDiscoverRequest**(`config`, `request`): [`ProcessDiscoverOutcome`](../type-aliases/ProcessDiscoverOutcome.md)

Defined in: [protocol/discovery.ts:353](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L353)

The reference `server/discover` handler every server MUST implement. (R-5.3-a)

Behavior:
  - A malformed request (wrong method, missing/invalid reserved `_meta` keys)
    yields an invalid-params (-32602) error.
  - A well-formed request whose declared revision the server does NOT support
    does not crash or hang; it yields an `UnsupportedProtocolVersion` (-32004)
    error whose `data.supported` lists the server's revisions and whose
    `data.requested` echoes the rejected revision. (R-5.3.1-f, R-5.3.1-g)
  - Otherwise it yields a `DiscoverResult`. (R-5.3.2-a – R-5.3.2-k)

The handler is stateless: it derives the requested revision solely from the
request's `_meta` and never from a prior request or the connection.

## Parameters

### config

[`DiscoverConfig`](../interfaces/DiscoverConfig.md)

The server's advertised revisions, capabilities, and identity.

### request

`unknown`

A raw `server/discover` request object.

## Returns

[`ProcessDiscoverOutcome`](../type-aliases/ProcessDiscoverOutcome.md)
