[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildReRequestInputRequiredResult

# Function: buildReRequestInputRequiredResult()

> **buildReRequestInputRequiredResult**(`inputRequests`, `inputResponses`, `requestState?`): `objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"input_required"`\>; `inputRequests`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodDiscriminatedUnion`\<`"method"`, \[`ZodObject`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `null`

Defined in: [protocol/multi-round-trip.ts:824](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L824)

Builds a NEW `InputRequiredResult` re-requesting only the still-missing input,
or `null` when the retry supplied everything. A server whose retry
`inputResponses` is well-formed but incomplete SHOULD re-request the missing
information rather than failing the request. (§11.5 line 2520, R-11.5-q)

## Parameters

### inputRequests

`Record`\<`string`, [`InputRequest`](../type-aliases/InputRequest.md)\>

The server's original `inputRequests` map.

### inputResponses

`Record`\<`string`, `unknown`\>

The client's retry `inputResponses`.

### requestState?

`string`

OPTIONAL continuation token to echo on the new result.

## Returns

`objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"input_required"`\>; `inputRequests`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodDiscriminatedUnion`\<`"method"`, \[`ZodObject`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `method`: `ZodLiteral`\<`"sampling/createMessage"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<...\>; `params`: `ZodRecord`\<..., ...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `null`
