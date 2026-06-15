[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProgressNotificationParamsSchema

# Variable: ProgressNotificationParamsSchema

> `const` **ProgressNotificationParamsSchema**: `ZodObject`\<\{ `progressToken`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `progress`: `ZodNumber`; `total`: `ZodOptional`\<`ZodNumber`\>; `message`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `progressToken`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `progress`: `ZodNumber`; `total`: `ZodOptional`\<`ZodNumber`\>; `message`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `progressToken`: `ZodUnion`\<\[`ZodString`, `ZodNumber`\]\>; `progress`: `ZodNumber`; `total`: `ZodOptional`\<`ZodNumber`\>; `message`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/progress.ts:46](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L46)

The params object carried by a `notifications/progress` notification. (§15.1.3)

`progressToken` (REQUIRED): correlates this notification to the in-flight
request that opted in via `_meta.progressToken`. (R-15.1.3-a, R-15.1.3-b)

`progress` (REQUIRED): progress made so far; MUST strictly increase with each
successive notification for the same token. (R-15.1.3-d, R-15.1.3-e)

`total` (OPTIONAL): total expected; omitted when unknown. (R-15.1.3-g)

`message` (OPTIONAL): human-readable description for display. (R-15.1.3-j)
