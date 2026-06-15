[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MalformedIdErrorResponse

# Interface: MalformedIdErrorResponse

Defined in: [transport/correlation.ts:185](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L185)

An error response whose `id` could not be read because the originating
request was malformed. Per R-7.2-h this MAY carry a `null` id or omit it —
the one exception to the strict id-echo rule of S03.

## Properties

### jsonrpc

> **jsonrpc**: `"2.0"`

Defined in: [transport/correlation.ts:186](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L186)

***

### id?

> `optional` **id?**: `string` \| `number` \| `null`

Defined in: [transport/correlation.ts:188](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L188)

`null` or omitted — the unreadable-id exception (R-7.2-h).

***

### error

> **error**: `object`

Defined in: [transport/correlation.ts:189](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L189)

#### code

> **code**: `number`

#### message

> **message**: `string`

#### data?

> `optional` **data?**: `unknown`
