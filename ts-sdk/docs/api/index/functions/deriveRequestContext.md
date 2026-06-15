[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / deriveRequestContext

# Function: deriveRequestContext()

> **deriveRequestContext**(`request`): [`RequestContext`](../interfaces/RequestContext.md) \| `undefined`

Defined in: [transport/contract.ts:199](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L199)

Derives the per-request context (protocol version, client identity, client
capabilities) **solely from the request's own `_meta`**, never from the
connection or any prior request. (R-7.6-e, R-7.6-f)

Returns `undefined` when the request does not carry a valid envelope; the
server then has no basis to process it (and MUST NOT infer one from earlier
requests). Two requests on the same connection with different envelopes yield
two independent contexts — the connection contributes nothing.

## Parameters

### request

`unknown`

## Returns

[`RequestContext`](../interfaces/RequestContext.md) \| `undefined`
