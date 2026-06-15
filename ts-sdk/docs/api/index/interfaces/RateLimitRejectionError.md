[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RateLimitRejectionError

# Interface: RateLimitRejectionError

Defined in: [protocol/security.ts:524](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L524)

A §28.3 rate-limit rejection error object, matching the story's wire example.

## Properties

### code

> **code**: `-32600`

Defined in: [protocol/security.ts:525](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L525)

***

### message

> **message**: `string`

Defined in: [protocol/security.ts:526](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L526)

***

### data?

> `optional` **data?**: `object`

Defined in: [protocol/security.ts:527](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L527)

#### retryAfterMs?

> `optional` **retryAfterMs?**: `number`
