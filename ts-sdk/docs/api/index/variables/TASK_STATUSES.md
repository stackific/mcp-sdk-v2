[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TASK\_STATUSES

# Variable: TASK\_STATUSES

> `const` **TASK\_STATUSES**: readonly \[`"working"`, `"input_required"`, `"completed"`, `"failed"`, `"cancelled"`\]

Defined in: [protocol/tasks.ts:208](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L208)

The five case-sensitive lifecycle states a task may be in. (§25.5, R-25.5-a)

  - `working`        — operation in progress (non-terminal);
  - `input_required` — server requires client input before continuing
                       (non-terminal; outstanding requests in `inputRequests`);
  - `completed`      — finished successfully (terminal; result inline);
  - `failed`         — a JSON-RPC error occurred (terminal; error inline);
  - `cancelled`      — ended via cancellation (terminal).
