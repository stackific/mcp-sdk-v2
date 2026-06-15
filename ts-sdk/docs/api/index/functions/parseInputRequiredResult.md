[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseInputRequiredResult

# Function: parseInputRequiredResult()

> **parseInputRequiredResult**(`rawJson`): [`ParseInputRequiredResult`](../type-aliases/ParseInputRequiredResult.md)

Defined in: [protocol/multi-round-trip.ts:715](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L715)

Parses an `InputRequiredResult` from its raw JSON text, treating a duplicate
object member name as malformed — the §11.2 rule that a receiver encountering
duplicate `inputRequests` keys MUST treat the result as malformed (R-11.2-f),
which is stricter than the base §2.3.1 last-wins tolerance. Duplicate detection
runs on the raw text because `JSON.parse` would already have collapsed repeats.

Use this instead of `JSON.parse` + [isInputRequiredResult](isInputRequiredResult.md) when the raw
wire text is available and duplicate-key strictness is required (TV-17.10).

## Parameters

### rawJson

`string`

The raw JSON text of the result object.

## Returns

[`ParseInputRequiredResult`](../type-aliases/ParseInputRequiredResult.md)
