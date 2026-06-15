[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / asChildProcessLike

# Function: asChildProcessLike()

> **asChildProcessLike**(`child`): [`ChildProcessLike`](../interfaces/ChildProcessLike.md)

Defined in: [transport/stdio.ts:646](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L646)

Adapts a real `node:child_process.ChildProcess` (or any structurally
compatible object) into a [ChildProcessLike](../interfaces/ChildProcessLike.md). (§8 launch)

This is a thin pass-through: a Node `ChildProcess` already exposes
`stdin`/`stdout`/`stderr`, `exitCode`, `kill`, and an `'exit'` event, so it
satisfies the interface directly. Provided so real-spawn callers have a typed
entry point without the core logic depending on `node:child_process`.

## Parameters

### child

[`ChildProcessLike`](../interfaces/ChildProcessLike.md)

## Returns

[`ChildProcessLike`](../interfaces/ChildProcessLike.md)
