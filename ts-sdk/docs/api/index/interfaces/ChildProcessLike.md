[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ChildProcessLike

# Interface: ChildProcessLike

Defined in: [transport/stdio.ts:72](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L72)

The minimal view of a child process the stdio transport needs. (§8 topology)

Modeled so the three streams can be in-memory `node:stream` objects in tests
(no real OS process), while a real `node:child_process.ChildProcess`
structurally satisfies the same shape. `stdin` is the client→server byte sink,
`stdout` the server→client byte source, and `stderr` an optional free-form
diagnostic source that is never parsed as protocol (R-8.1-a, R-8.4-b).

## Properties

### stdin

> `readonly` **stdin**: `Writable` \| `null`

Defined in: [transport/stdio.ts:74](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L74)

Client→server byte sink. Closing it (`end()`) signals graceful shutdown (EOF).

***

### stdout

> `readonly` **stdout**: `Readable` \| `null`

Defined in: [transport/stdio.ts:76](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L76)

Server→client byte source carrying newline-framed JSON-RPC messages.

***

### stderr?

> `readonly` `optional` **stderr?**: `Readable` \| `null`

Defined in: [transport/stdio.ts:78](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L78)

Optional free-form UTF-8 diagnostics; NEVER parsed as protocol. (R-8.1-a)

***

### exitCode?

> `readonly` `optional` **exitCode?**: `number` \| `null`

Defined in: [transport/stdio.ts:80](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L80)

The process exit code once exited, else `null`.

## Methods

### kill()

> **kill**(`signal?`): `boolean`

Defined in: [transport/stdio.ts:85](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L85)

Forcibly signals the process. (R-8.6.3-a) On a real child this maps to
`ChildProcess.kill`; in tests it is observed to assert escalation occurred.

#### Parameters

##### signal?

`number` \| `Signals`

#### Returns

`boolean`

***

### on()

> **on**(`event`, `listener`): `unknown`

Defined in: [transport/stdio.ts:87](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L87)

Subscribes to the one-shot process-exit event (exit or signal).

#### Parameters

##### event

`"exit"`

##### listener

(`code`, `signal`) => `void`

#### Returns

`unknown`

***

### off()?

> `optional` **off**(`event`, `listener`): `unknown`

Defined in: [transport/stdio.ts:89](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L89)

Unsubscribes a previously registered listener.

#### Parameters

##### event

`"exit"`

##### listener

(`code`, `signal`) => `void`

#### Returns

`unknown`
