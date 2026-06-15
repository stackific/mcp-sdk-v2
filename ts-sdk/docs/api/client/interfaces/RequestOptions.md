[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / RequestOptions

# Interface: RequestOptions

Defined in: client/client.ts:80

Per-call options for [Client.request](../classes/Client.md#request) / [Client.callTool](../classes/Client.md#calltool).

## Properties

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: client/client.ts:82

Abort the request; sends `notifications/cancelled` and rejects locally. (§15.2)

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: client/client.ts:84

Reject (and cancel) the request if no response arrives within this many ms.

***

### onProgress?

> `optional` **onProgress?**: [`ProgressHandler`](../type-aliases/ProgressHandler.md)

Defined in: client/client.ts:86

Receive correlated `notifications/progress` for this request. (§15.1)

***

### progressToken?

> `optional` **progressToken?**: `string` \| `number`

Defined in: client/client.ts:88

Explicit progress token; one is derived from the request id when omitted.
