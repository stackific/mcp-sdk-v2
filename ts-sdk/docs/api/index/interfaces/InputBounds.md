[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InputBounds

# Interface: InputBounds

Defined in: [protocol/security.ts:1467](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1467)

Resource bounds a receiver imposes while validating peer inputs. (§28.10, R-28.10-k, R-28.10-l)

## Properties

### maxSchemaDepth

> **maxSchemaDepth**: `number`

Defined in: [protocol/security.ts:1469](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1469)

Maximum schema nesting depth; deeper schemas are rejected. (R-28.10-k)

***

### maxPayloadBytes

> **maxPayloadBytes**: `number`

Defined in: [protocol/security.ts:1471](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1471)

Maximum serialized payload size in bytes; larger inputs are rejected. (R-28.10-l)
