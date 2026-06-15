[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCallToolResult

# Function: buildCallToolResult()

> **buildCallToolResult**(`config`): `objectOutputType`

Defined in: [protocol/tools-call.ts:318](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L318)

Builds a completed `CallToolResult`. `resultType` is fixed to `"complete"`
(R-16.5-r). `structuredContent`, `isError`, and `_meta` are included only when
supplied; `structuredContent` is included whenever the property is present in
`config` (so an explicit `null` survives, R-16.5-n). (§16.5)

This builder does NOT itself enforce the `outputSchema` conformance rule
(R-16.5-o) — that belongs to the dispatch path, where the tool's `outputSchema`
is known; see [validateToolStructuredContent](validateToolStructuredContent.md) (S24) and
[buildOutputSchemaResult](buildOutputSchemaResult.md).

## Parameters

### config

[`CallToolResultConfig`](../interfaces/CallToolResultConfig.md)

## Returns

`objectOutputType`
