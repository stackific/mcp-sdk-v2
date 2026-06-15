[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CallToolRequestParamsSchema

# Variable: CallToolRequestParamsSchema

> `const` **CallToolRequestParamsSchema**: `ZodObject`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `inputResponses`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `requestState`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tools-call.ts:81](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L81)

The `params` of a `tools/call` request invoking a named tool. (§16.5)

Field constraints:
  - `name` REQUIRED string: the tool to invoke; MUST match a tool the server
    currently exposes to the caller (the *exposure* check is a dispatch-time
    concern handled by [dispatchToolCall](../functions/dispatchToolCall.md), not a shape concern).
    (R-16.5-a, R-16.5-b)
  - `arguments` OPTIONAL object: the call arguments; when present MUST validate
    against the tool's `inputSchema` (validated by S24's `validateToolArguments`
    at dispatch, R-16.5-d); when omitted the server MUST treat it as `{}`
    (R-16.5-e, see [resolveCallToolArguments](../functions/resolveCallToolArguments.md)). (R-16.5-c)
  - `inputResponses` OPTIONAL object: on retry after an `input_required`
    result, the responses keyed by the server's earlier `inputRequests` keys
    (mechanics per S17). (R-16.5-f, R-16.5-g)
  - `requestState` OPTIONAL string: the opaque continuation token echoed back
    unchanged on retry; the client MUST treat it as opaque and MUST NOT
    interpret or modify it (S17). (R-16.5-h, R-16.5-i, R-16.5-j)
  - `_meta` OPTIONAL reserved metadata map (e.g. a `progressToken`). (R-16.5-k)

`arguments` is `z.record(z.unknown())` — a JSON object whose member values MAY
be any JSON value. `.passthrough()` preserves forward-compatible members.
