[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildHeaderMismatchError

# Function: buildHeaderMismatchError()

> **buildHeaderMismatchError**(`message?`, `data?`): `objectOutputType`

Defined in: [transport/http/responses.ts:329](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L329)

Builds the full `-32001` `HeaderMismatch` JSON-RPC error *object* (not just the
code). (R-9.8-a) The code sits in the implementation-defined server-error
range `-32000`…`-32099`; this is the object S14 deferred to S15.

## Parameters

### message?

`string` = `'Header mismatch: HTTP headers do not match the request body'`

A human-readable mismatch description (e.g. naming the
  offending header and the body value it disagrees with).

### data?

`unknown`

OPTIONAL structured detail for the error.

## Returns

`objectOutputType`
