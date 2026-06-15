[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RESULT\_TYPE

# Variable: RESULT\_TYPE

> `const` **RESULT\_TYPE**: `object`

Defined in: [jsonrpc/payload.ts:22](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L22)

The two `ResultType` values defined by this specification (§3.6, R-3.6-e).

Additional values MAY exist only when introduced via the extension mechanism
(§24 / S38). Implementations MUST NOT mint new values outside it.

## Type Declaration

### COMPLETE

> `readonly` **COMPLETE**: `"complete"` = `'complete'`

The request completed; the result carries the final content for the method.

### INPUT\_REQUIRED

> `readonly` **INPUT\_REQUIRED**: `"input_required"` = `'input_required'`

The server needs more client input before it can finish the request (§11 / S17).
