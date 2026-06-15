[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TaskSchema

# Variable: TaskSchema

> `const` **TaskSchema**: `ZodObject`\<\{ `taskId`: `ZodString`; `status`: `ZodEnum`\<\[`"working"`, `"input_required"`, `"completed"`, `"failed"`, `"cancelled"`\]\>; `statusMessage`: `ZodOptional`\<`ZodString`\>; `createdAt`: `ZodString`; `lastUpdatedAt`: `ZodString`; `ttlMs`: `ZodUnion`\<\[`ZodNumber`, `ZodNull`\]\>; `pollIntervalMs`: `ZodOptional`\<`ZodNumber`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `taskId`: `ZodString`; `status`: `ZodEnum`\<\[`"working"`, `"input_required"`, `"completed"`, `"failed"`, `"cancelled"`\]\>; `statusMessage`: `ZodOptional`\<`ZodString`\>; `createdAt`: `ZodString`; `lastUpdatedAt`: `ZodString`; `ttlMs`: `ZodUnion`\<\[`ZodNumber`, `ZodNull`\]\>; `pollIntervalMs`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `taskId`: `ZodString`; `status`: `ZodEnum`\<\[`"working"`, `"input_required"`, `"completed"`, `"failed"`, `"cancelled"`\]\>; `statusMessage`: `ZodOptional`\<`ZodString`\>; `createdAt`: `ZodString`; `lastUpdatedAt`: `ZodString`; `ttlMs`: `ZodUnion`\<\[`ZodNumber`, `ZodNull`\]\>; `pollIntervalMs`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks.ts:337](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L337)

The handle and status record for a long-running operation. (§25.4)

REQUIRED fields (R-25.4-b): `taskId`, `status`, `createdAt`, `lastUpdatedAt`,
`ttlMs`. OPTIONAL: `statusMessage`, `pollIntervalMs`.

  `taskId`         — opaque, server-minted identifier; the client MUST treat it
                     as opaque and MUST NOT parse or derive meaning from it
                     (R-25.4-a).
  `status`         — current lifecycle state ([TaskStatus](../type-aliases/TaskStatus.md)).
  `statusMessage`  — OPTIONAL human-readable description; display only, no
                     protocol semantics.
  `createdAt`      — RFC 3339 date-time string at which the task was created.
  `lastUpdatedAt`  — RFC 3339 date-time string of the last state modification.
  `ttlMs`          — lifetime in ms from creation; `null` ⇒ unbounded
                     ([TaskTtlMsSchema](TaskTtlMsSchema.md), R-25.4-c).
  `pollIntervalMs` — OPTIONAL recommended MINIMUM ms between successive
                     `tasks/get` polls; clients SHOULD NOT poll faster
                     (R-25.4-d, R-25.4-e).

`.passthrough()` preserves additional members (e.g. an active extension's
fields) through parse.
