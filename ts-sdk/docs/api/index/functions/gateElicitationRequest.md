[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / gateElicitationRequest

# Function: gateElicitationRequest()

> **gateElicitationRequest**(`clientCaps`, `mode?`): [`ElicitationGateResult`](../type-aliases/ElicitationGateResult.md)

Defined in: [protocol/elicitation.ts:478](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L478)

Decides whether a server MAY send an `elicitation/create` request of `mode` to
a client with the given declared capabilities. (§20.1, R-20.1-d, R-20.1-e)

  - A server MUST NOT return an `elicitation/create` input-required result to a
    client that has not declared `elicitation` → `capability-not-declared`.
    (R-20.1-e)
  - A server MUST NOT send a request whose `mode` the client's declared
    sub-flags do not support (empty-object equivalence applied) →
    `mode-not-supported`. (R-20.1-d)

Returns `{ ok: true }` only when both prohibitions are cleared.

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

The client's declared `ClientCapabilities`.

### mode?

[`ElicitationMode`](../type-aliases/ElicitationMode.md) = `ELICITATION_MODE.FORM`

The mode the server intends to use. Defaults to `"form"`,
  matching the absent-mode baseline of a form-mode request. (R-20.3-c)

## Returns

[`ElicitationGateResult`](../type-aliases/ElicitationGateResult.md)
