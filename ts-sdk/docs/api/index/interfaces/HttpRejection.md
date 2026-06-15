[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / HttpRejection

# Interface: HttpRejection

Defined in: [transport/http/headers.ts:89](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L89)

A rejected POST: HTTP `400` plus a JSON-RPC error to put in the body.

## Properties

### status

> **status**: `400`

Defined in: [transport/http/headers.ts:90](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L90)

***

### error

> **error**: `object`

Defined in: [transport/http/headers.ts:91](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L91)

#### code

> **code**: `number`

#### message

> **message**: `string`

#### data?

> `optional` **data?**: `unknown`
