[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TaskSubscriptionFilterSchema

# Variable: TaskSubscriptionFilterSchema

> `const` **TaskSubscriptionFilterSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tasks-lifecycle.ts:551](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L551)

The S40 extension to S16's `SubscriptionFilter`: an OPTIONAL `taskIds` array by
which a client opts in to `notifications/tasks` for the named tasks. (§25.10,
R-25.10-b, R-25.10-c)

Each element MUST be a `taskId` the client holds (R-25.10-c). Extends
S16's [SubscriptionFilterSchema](SubscriptionFilterSchema.md) so the §10 filter fields remain valid on
the same `subscriptions/listen` request; `.passthrough()` keeps any other §10
members. Supplying `taskIds` without the negotiated tasks capability MUST yield
`-32003` on `subscriptions/listen` ([buildTasksMissingCapabilityError](../functions/buildTasksMissingCapabilityError.md),
R-25.10-e).
