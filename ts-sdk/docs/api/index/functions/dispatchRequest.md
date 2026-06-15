[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / dispatchRequest

# Function: dispatchRequest()

> **dispatchRequest**(`request`, `registry`): [`DispatchOutcome`](../type-aliases/DispatchOutcome.md)

Defined in: [jsonrpc/dispatch.ts:83](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/dispatch.ts#L83)

Validates a classified request against a method registry and returns the
dispatch outcome.

Returns `{ ok: true }` when the method is registered and params are valid.

Returns `{ ok: false, response }` — with the appropriate error response
whose `id` echoes the request id with the same JSON type and value
(R-3.2-e, R-3.2-f, R-3.2-g) — when any of the following hold:

 - The method name is not in `registry` → **method-not-found** (R-3.3-j).
 - `descriptor.requiresParams` is `true` and `request.params` is absent
   (e.g. method carries per-request `_meta` REQUIRED) → **invalid-params**. (R-3.3-i)
 - `descriptor.paramsSchema` is provided and `request.params` fails
   parsing → **invalid-params**. (R-3.3-k)

## Parameters

### request

`objectOutputType`

A `JSONRPCRequest` produced by `classifyMessage`.

### registry

[`MethodRegistry`](../type-aliases/MethodRegistry.md)

The set of methods the receiver handles.

## Returns

[`DispatchOutcome`](../type-aliases/DispatchOutcome.md)
