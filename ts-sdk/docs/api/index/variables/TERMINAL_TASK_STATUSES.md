[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TERMINAL\_TASK\_STATUSES

# Variable: TERMINAL\_TASK\_STATUSES

> `const` **TERMINAL\_TASK\_STATUSES**: `Set`\<`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`\>

Defined in: [protocol/tasks.ts:233](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L233)

The three terminal task states. (§25.5)

Once a task reaches one of these its `status` and inline `result`/`error` are
immutable; it MUST NOT subsequently transition to any other state (R-25.5-b).
