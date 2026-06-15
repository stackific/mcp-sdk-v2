[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ReadResourceRequestParamsSchema

# Variable: ReadResourceRequestParamsSchema

> `const` **ReadResourceRequestParamsSchema**: `ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/resources-read.ts:195](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L195)

The `params` of a `resources/read` request. (§17.5)

  - `uri` REQUIRED — the exact resource to read, in URI format [RFC3986]. MAY
    be a concrete resource from `resources/list` or a URI produced by
    expanding a `ResourceTemplate`. (R-17.5-b, R-17.5-c)
  - `inputResponses` OPTIONAL — present only on a retry that satisfies the
    server's earlier `inputRequests`. Every key from those `inputRequests`
    MUST appear here with its response. Mechanics owned by §11 / S17.
    (R-17.5-a, R-17.5-d, R-17.5-e)
  - `requestState` OPTIONAL — the opaque continuation token from an earlier
    `input_required` result, echoed back UNCHANGED on retry; the client MUST
    treat it as opaque and MUST NOT interpret or modify it.
    (R-17.5-f, R-17.5-g, R-17.5-h)
  - `_meta` OPTIONAL reserved metadata map (§14 / S21).

`_meta` is OPTIONAL on this abstract params shape (per §17.5's table); the
per-request reserved keys of §4 are layered on by the transport, exactly as
for the other resource methods. `.passthrough()` preserves forward-compatible
members. The retry fields mirror `InputResponseRequestParamsSchema` (S17),
which owns their semantics.
