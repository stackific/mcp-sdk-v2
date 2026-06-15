[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / JsonRpcErrorObject

# Interface: JsonRpcErrorObject

Defined in: [protocol/errors.ts:331](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L331)

The canonical JSON-RPC `error` object. (§22.1 / §3.8) `code` is REQUIRED and
MUST be an integer (it MAY be negative); `message` is REQUIRED and is a short
human-readable description; `data` is OPTIONAL. (R-22.1-c, R-22.1-h, R-22.1-i,
R-22.1-k)

## Properties

### code

> **code**: `number`

Defined in: [protocol/errors.ts:333](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L333)

The authoritative numeric condition code. (R-22.1-h)

***

### message

> **message**: `string`

Defined in: [protocol/errors.ts:335](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L335)

Short, human-readable description — informational only. (R-22.1-i, R-22.1-j)

***

### data?

> `optional` **data?**: `unknown`

Defined in: [protocol/errors.ts:337](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L337)

Optional additional information; normative for `-32003`/`-32004`. (R-22.1-k)
