[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateInputRequiredRetry

# Function: validateInputRequiredRetry()

> **validateInputRequiredRetry**(`opts`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"reused-id"` \| `"state-mismatch"` \| `"unexpected-state"`; \}

Defined in: [protocol/conformance-requirements.ts:596](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L596)

Validates a client's retry request after an `input_required` result. (§29.3
item 4, R-29.3-j) The retry MUST: (a) use a request id distinct from the
original, (b) echo `requestState` byte-for-byte when one was provided, and
(c) omit `requestState` when none was provided.

Returns `{ ok: false, reason }` identifying the first violated rule, else
`{ ok: true }`. `requestState` comparison is strict equality (the value is
opaque and echoed exactly, R-29.3-f).

## Parameters

### opts

#### originalId

`string` \| `number`

The original request's id.

#### retryId

`string` \| `number`

The retry request's id (must differ).

#### providedState?

`string`

The requestState the server provided, or undefined when none.

#### retryState?

`string`

The requestState the retry carries, or undefined when absent.

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"reused-id"` \| `"state-mismatch"` \| `"unexpected-state"`; \}
