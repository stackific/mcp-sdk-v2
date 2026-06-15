[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ServerRequestContext

# Interface: ServerRequestContext

Defined in: [protocol/conformance-requirements.ts:443](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L443)

Inputs to [classifyServerRequest](../functions/classifyServerRequest.md): a single self-contained §4 request and the server's surface.

## Properties

### meta

> `readonly` **meta**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/conformance-requirements.ts:445](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L445)

The request's `params._meta` envelope (raw).

***

### serverSupportedRevisions

> `readonly` **serverSupportedRevisions**: readonly `string`[]

Defined in: [protocol/conformance-requirements.ts:447](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L447)

The revisions the server supports (always includes the wire value).

***

### requiredClientCapabilities?

> `readonly` `optional` **requiredClientCapabilities?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/conformance-requirements.ts:449](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L449)

The capabilities required to process this request, as a ClientCapabilities-shaped map.

***

### featureAdvertised?

> `readonly` `optional` **featureAdvertised?**: `boolean`

Defined in: [protocol/conformance-requirements.ts:451](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L451)

Whether the requested feature is gated behind a capability the server advertised.
