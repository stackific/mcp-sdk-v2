[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / LoggingMessageNotificationParamsSchema

# Variable: LoggingMessageNotificationParamsSchema

> `const` **LoggingMessageNotificationParamsSchema**: `ZodEffects`\<`ZodObject`\<\{ `level`: `ZodEnum`\<\[`"debug"`, `"info"`, `"notice"`, `"warning"`, `"error"`, `"critical"`, `"alert"`, `"emergency"`\]\>; `logger`: `ZodOptional`\<`ZodString`\>; `data`: `ZodUnknown`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `level`: `ZodEnum`\<\[`"debug"`, `"info"`, `"notice"`, `"warning"`, `"error"`, `"critical"`, `"alert"`, `"emergency"`\]\>; `logger`: `ZodOptional`\<`ZodString`\>; `data`: `ZodUnknown`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `level`: `ZodEnum`\<\[`"debug"`, `"info"`, `"notice"`, `"warning"`, `"error"`, `"critical"`, `"alert"`, `"emergency"`\]\>; `logger`: `ZodOptional`\<`ZodString`\>; `data`: `ZodUnknown`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<\{ `level`: `ZodEnum`\<\[`"debug"`, `"info"`, `"notice"`, `"warning"`, `"error"`, `"critical"`, `"alert"`, `"emergency"`\]\>; `logger`: `ZodOptional`\<`ZodString`\>; `data`: `ZodUnknown`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `level`: `ZodEnum`\<\[`"debug"`, `"info"`, `"notice"`, `"warning"`, `"error"`, `"critical"`, `"alert"`, `"emergency"`\]\>; `logger`: `ZodOptional`\<`ZodString`\>; `data`: `ZodUnknown`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/logging.ts:55](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L55)

The params object of a `notifications/message` log notification. (§15.3.2)

`level` (REQUIRED): exactly one of the eight `LoggingLevel` strings.
`logger` (OPTIONAL): identifies the emitting logger.
`data` (REQUIRED): the log payload — any JSON-serializable value.
  MUST NOT contain credentials, secrets, PII, or attacker-aiding internals.
  (R-15.3.2-e)
