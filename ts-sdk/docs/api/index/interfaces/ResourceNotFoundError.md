[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceNotFoundError

# Interface: ResourceNotFoundError

Defined in: [protocol/resources-read.ts:128](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L128)

A JSON-RPC resource-not-found error payload. (§17.6)

## Properties

### code

> **code**: `-32602`

Defined in: [protocol/resources-read.ts:130](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L130)

`-32602` (Invalid params). (R-17.6-a)

***

### message

> **message**: `string`

Defined in: [protocol/resources-read.ts:132](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L132)

Human-readable description, e.g. "Resource not found".

***

### data

> **data**: [`ResourceNotFoundErrorData`](ResourceNotFoundErrorData.md)

Defined in: [protocol/resources-read.ts:134](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L134)

SHOULD include the offending `uri`. (R-17.6-b)
