[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / JsonRpcErrorResponse

# Interface: JsonRpcErrorResponse

Defined in: [protocol/errors.ts:358](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L358)

The error response envelope, restated for reference (owned by S03 / §3.5.2).
Carries an `error` in place of a `result`. `id` is normally REQUIRED and MUST
equal the answered request's id; it MAY be `null`/omitted only when the
request id could not be determined. (R-22.1-a, R-22.1-b, R-22.1-d, R-22.1-f)

## Properties

### jsonrpc

> **jsonrpc**: `"2.0"`

Defined in: [protocol/errors.ts:359](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L359)

***

### id?

> `optional` **id?**: [`JsonRpcId`](../type-aliases/JsonRpcId.md) \| `null`

Defined in: [protocol/errors.ts:361](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L361)

Echoes the request id; `null` only when the id is undeterminable. (§22.6)

***

### error

> **error**: [`JsonRpcErrorObject`](JsonRpcErrorObject.md)

Defined in: [protocol/errors.ts:362](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L362)
