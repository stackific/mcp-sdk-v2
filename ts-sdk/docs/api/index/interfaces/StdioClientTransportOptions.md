[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StdioClientTransportOptions

# Interface: StdioClientTransportOptions

Defined in: [transport/stdio.ts:375](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L375)

Options for [StdioClientTransport](../classes/StdioClientTransport.md).

## Properties

### child?

> `optional` **child?**: [`ChildProcessLike`](ChildProcessLike.md)

Defined in: [transport/stdio.ts:377](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L377)

The already-launched child process, or use [launcher](#launcher) for restart support.

***

### launcher?

> `optional` **launcher?**: [`ChildProcessLauncher`](../type-aliases/ChildProcessLauncher.md)

Defined in: [transport/stdio.ts:383](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L383)

A factory that launches a fresh child. REQUIRED to enable
restart-on-unexpected-exit (R-8.6.4-a); when provided and `child` is omitted,
the first child is launched immediately.

***

### shutdownGraceMs?

> `optional` **shutdownGraceMs?**: `number`

Defined in: [transport/stdio.ts:388](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L388)

Milliseconds to wait for the child to exit after `stdin` is closed before
forcibly terminating it. (R-8.6.2-a step 3, R-8.6.3-a) Defaults to 5000.

***

### restartOnUnexpectedExit?

> `optional` **restartOnUnexpectedExit?**: `boolean`

Defined in: [transport/stdio.ts:394](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L394)

When `true`, an unexpected child exit triggers an automatic restart via
[launcher](#launcher). (R-8.6.4-a SHOULD) Defaults to `true` when a `launcher`
is supplied, `false` otherwise.

***

### onInflightLost?

> `optional` **onInflightLost?**: (`lostIds`) => `void`

Defined in: [transport/stdio.ts:400](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L400)

A callback invoked with the ids of in-flight requests lost on an unexpected
exit, so the caller MAY retry them against the fresh process. (R-8.6.4-b)
Receives the restarted transport's `send`-ready state via onRestart.

#### Parameters

##### lostIds

readonly (`string` \| `number`)[]

#### Returns

`void`
