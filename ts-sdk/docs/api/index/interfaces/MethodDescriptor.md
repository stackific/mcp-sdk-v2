[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MethodDescriptor

# Interface: MethodDescriptor

Defined in: [jsonrpc/dispatch.ts:29](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/dispatch.ts#L29)

Describes a method that a receiver recognises.

A method is registered by name in a `MethodRegistry`; absent entries cause
`dispatchRequest` to produce a method-not-found error response. (R-3.3-j)

## Properties

### requiresParams?

> `optional` **requiresParams?**: `boolean`

Defined in: [jsonrpc/dispatch.ts:38](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/dispatch.ts#L38)

When `true`, the `params` object MUST be present on every request to this
method. This covers the case where a method's per-request `_meta` is
REQUIRED — `params` must be provided to carry it. (R-3.3-i)

Requests that omit `params` for such a method are rejected with an
invalid-params error response.

***

### paramsSchema?

> `optional` **paramsSchema?**: `ZodType`\<`unknown`, `ZodTypeDef`, `unknown`\>

Defined in: [jsonrpc/dispatch.ts:49](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/dispatch.ts#L49)

Optional Zod schema used to validate the incoming `params` object.

When provided and `params` fails parsing, `dispatchRequest` returns an
invalid-params error response. (R-3.3-k)

Leave `undefined` to skip schema validation (method accepts any params
or no params beyond the `requiresParams` check).
