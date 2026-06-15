[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceNotFoundErrorData

# Interface: ResourceNotFoundErrorData

Defined in: [protocol/resources-read.ts:120](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L120)

The `data` payload of a resource-not-found error. (§17.6, R-17.6-b)

## Indexable

> \[`key`: `string`\]: `unknown`

Additional sender-defined detail MAY be present.

## Properties

### uri?

> `optional` **uri?**: `string`

Defined in: [protocol/resources-read.ts:122](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L122)

SHOULD carry the offending `uri` so the client can correlate the failure. (R-17.6-b)
