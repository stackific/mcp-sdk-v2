[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / schemaNestingDepth

# Function: schemaNestingDepth()

> **schemaNestingDepth**(`node`, `cap?`): `number`

Defined in: [protocol/tools.ts:260](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L260)

Returns the maximum nesting depth of a schema document (objects + arrays).
Counting stops at `cap` so a self-referential or pathologically deep value
cannot exhaust the stack. (§16.4(6), R-16.4-l)

## Parameters

### node

`unknown`

The schema value.

### cap?

`number` = `...`

Hard recursion cap; the returned depth is never above this.

## Returns

`number`
