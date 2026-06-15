[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InputResponseRequestParamsSchema

# Variable: InputResponseRequestParamsSchema

> `const` **InputResponseRequestParamsSchema**: `ZodObject`\<\{ `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/multi-round-trip.ts:213](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L213)

The extra params any client-initiated retry request MAY carry to fulfill an
`InputRequiredResult`. (§11.4, R-11.4-a, R-11.4-b)

`_meta` (REQUIRED on request params, from S04 / RequestParamsSchema).
`inputResponses` (OPTIONAL): responses keyed identically to `inputRequests`.
`requestState` (OPTIONAL): the opaque continuation token echoed verbatim.

The client MUST NOT attach `inputResponses`/`requestState` from one exchange
to any other request (R-11.4-i).
