[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CancelledNotificationParamsSchema

# Variable: CancelledNotificationParamsSchema

> `const` **CancelledNotificationParamsSchema**: `ZodObject`\<\{ `requestId`: `ZodOptional`\<`ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>\>; `reason`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `requestId`: `ZodOptional`\<`ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>\>; `reason`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `requestId`: `ZodOptional`\<`ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>\>; `reason`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/progress.ts:87](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L87)

The params object carried by a `notifications/cancelled` notification. (§15.2.1)

`requestId` (MUST reference an in-flight request the sender issued):
optional in the schema shape because a receiver must tolerate malformed
cancellations gracefully (R-15.2.2-f), but semantically it MUST correspond
to a real in-flight request the sender issued in the same direction.
(R-15.2.1-a, R-15.2.1-b)

`reason` (OPTIONAL): human-readable explanation; MAY be logged. (R-15.2.1-c)
