[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyRequirementLevel

# Function: classifyRequirementLevel()

> **classifyRequirementLevel**(`keyword`): [`RequirementLevel`](../type-aliases/RequirementLevel.md) \| `undefined`

Defined in: [protocol/conformance-requirements.ts:156](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L156)

Classifies a normative `keyword` into its [RequirementLevel](../type-aliases/RequirementLevel.md) family.
(§2) Returns `undefined` for an unrecognized token — never throws, so a
conformance harness can report rather than crash on a malformed marker.

## Parameters

### keyword

`string`

## Returns

[`RequirementLevel`](../type-aliases/RequirementLevel.md) \| `undefined`
