[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / discriminateResultType

# Function: discriminateResultType()

> **discriminateResultType**(`result`, `clientCapabilities?`): [`ResultDiscrimination`](../type-aliases/ResultDiscrimination.md)

Defined in: [protocol/multi-round-trip.ts:246](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L246)

Branches on the `resultType` of a received result per the normative
client-side rules of §11.5.

- `"complete"` or absent `resultType` → `{ action: "complete" }`. (R-11.5-c, R-11.5-f)
- `"input_required"` with a valid `InputRequiredResult` → `{ action: "input_required", result }`.
- Any unrecognized `resultType` → `{ action: "error" }`. (R-11.5-d, R-11.5-e)
- Malformed `InputRequiredResult` → `{ action: "error" }`.

## Parameters

### result

`unknown`

### clientCapabilities?

`Record`\<`string`, `unknown`\>

## Returns

[`ResultDiscrimination`](../type-aliases/ResultDiscrimination.md)
