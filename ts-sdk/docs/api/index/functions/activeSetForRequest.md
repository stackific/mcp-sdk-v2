[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / activeSetForRequest

# Function: activeSetForRequest()

> **activeSetForRequest**(`requestClientExtensions`, `serverExtensions`): `string`[]

Defined in: [protocol/extension-mechanism.ts:435](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L435)

Computes the active set for ONE request under the stateless model: it reads
the client's capabilities from the request being processed and intersects them
with the server's advertised capabilities. (R-24.4-a, R-24.4-b, R-24.4-c)

The result depends solely on `requestClientExtensions` (this request's
advertised client capabilities) and `serverExtensions`; nothing from a prior
request is consulted. A request that does not advertise an extension therefore
yields an active set without it — it is served as if that extension were
inactive. (R-24.4-c)

## Parameters

### requestClientExtensions

`unknown`

The `extensions` map carried in THIS request's
  `io.modelcontextprotocol/clientCapabilities` (raw; `undefined` ⇒ none).

### serverExtensions

`unknown`

The server's advertised `extensions` map (raw).

## Returns

`string`[]
