[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DetailedTaskSchema

# Variable: DetailedTaskSchema

> `const` **DetailedTaskSchema**: `ZodDiscriminatedUnion`\<`"status"`, \[`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>\]\>

Defined in: [protocol/tasks.ts:515](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L515)

A `Task` that additionally conveys the terminal payload (or pending input
requests) inline; the shape returned by `tasks/get` (owned operationally by
S40). A union discriminated by `status`. (§25.4)

  - `working`        → no additional fields;
  - `input_required` → `inputRequests` (R-25.5-d: no `result`/`error`);
  - `completed`      → `result` (the verbatim ordinary result, R-25.5-d);
  - `failed`         → `error` (the inline JSON-RPC error, R-25.5-d);
  - `cancelled`      → no additional fields.

The underlying outcome is conveyed ONLY once terminal and ONLY inline here; a
non-terminal `DetailedTask` carries neither `result` nor `error` (R-25.5-d).
