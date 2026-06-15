[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildInputRequiredResult

# Function: buildInputRequiredResult()

> **buildInputRequiredResult**(`inputRequests?`, `requestState?`): `objectOutputType`

Defined in: [protocol/multi-round-trip.ts:165](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L165)

Builds an `InputRequiredResult` a server returns to solicit client input (§11.2).
At least one of `inputRequests`/`requestState` MUST be present (R-11.2-b) — pass
both for the normal solicitation case; `requestState` alone is a load-shedding
signal (§11.5).

## Parameters

### inputRequests?

`Record`\<`string`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

### requestState?

`string`

## Returns

`objectOutputType`
