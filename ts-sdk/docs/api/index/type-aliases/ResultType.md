[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResultType

# Type Alias: ResultType

> **ResultType** = `string`

Defined in: [jsonrpc/payload.ts:37](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L37)

An open string discriminator: the two spec-defined values plus any values
introduced through the extension mechanism (§24 / S38).

TypeScript note: `"complete" | "input_required" | string` collapses to `string`
at the type level. Use `RESULT_TYPE` constants and `isKnownResultType` to work
with the defined values in a type-safe way.
