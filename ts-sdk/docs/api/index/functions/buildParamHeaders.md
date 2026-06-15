[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildParamHeaders

# Function: buildParamHeaders()

> **buildParamHeaders**(`inputSchema`, `args`): `Record`\<`string`, `string`\>

Defined in: [transport/http/param-headers.ts:222](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L222)

Builds the `Mcp-Param-*` headers for a `tools/call` POST from the tool's
`inputSchema` and the call `arguments`. (§9.5.2)

One header per annotated parameter present in `arguments`; a parameter whose
value is `null` or absent is omitted (R-9.5.2-g, R-9.5.2-i); each present
value is encoded per §9.5.3 (R-9.5.2-c). Annotations under array `items` (no
single resolvable value) are skipped.

## Parameters

### inputSchema

`unknown`

### args

`Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `string`\>

## Throws

When an annotated integer value is out of the safe range.
