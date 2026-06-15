[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidTracestate

# Function: isValidTracestate()

> **isValidTracestate**(`value`): `boolean`

Defined in: [json/meta-key.ts:165](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/meta-key.ts#L165)

Returns `true` when `value` conforms to the W3C Trace Context tracestate grammar.
Each list member must be a `simple-key=value` or `tenant-id@system-id=value` pair;
up to 32 members separated by commas. (R-4.2-l, AC-05.15)

## Parameters

### value

`string`

## Returns

`boolean`
