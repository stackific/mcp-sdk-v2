[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / createCompletionDebouncer

# Function: createCompletionDebouncer()

> **createCompletionDebouncer**\<`T`\>(`run`, `waitMs?`): (`value`) => `Promise`\<`T`\>

Defined in: [protocol/completion.ts:816](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L816)

Wraps a completion runner so rapid successive calls (e.g. one per keystroke)
are coalesced into a single in-flight `completion/complete` request: each call
resets a `waitMs` timer, and only the final value after a quiet period is sent.
All callers awaiting during a burst resolve with that single result. (§19.5
line 4882, R-19.5-n)

Edge-friendly: uses only `setTimeout`/`clearTimeout` (no `node:*`).

## Type Parameters

### T

`T`

## Parameters

### run

(`value`) => `Promise`\<`T`\>

Issues the actual `completion/complete` for an argument value.

### waitMs?

`number` = `150`

Quiet period before the coalesced call fires. Default 150ms.

## Returns

(`value`) => `Promise`\<`T`\>
