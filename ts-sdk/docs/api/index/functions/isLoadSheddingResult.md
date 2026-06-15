[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isLoadSheddingResult

# Function: isLoadSheddingResult()

> **isLoadSheddingResult**(`result`): `boolean`

Defined in: [protocol/multi-round-trip.ts:186](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L186)

Returns `true` when `result` is a load-shedding signal: `resultType` is
`"input_required"`, `inputRequests` is absent or empty, and `requestState`
is present. (§11.5, R-11.5-l)

A client MUST NOT treat this as an error; it MAY retry immediately echoing
`requestState`, applying backoff on repeated non-progress. (R-11.5-m – R-11.5-p)

## Parameters

### result

`unknown`

## Returns

`boolean`
