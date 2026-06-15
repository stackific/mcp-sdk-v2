[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolFailureMechanism

# Variable: ToolFailureMechanism

> `const` **ToolFailureMechanism**: `object`

Defined in: [protocol/errors.ts:518](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L518)

The two distinct mechanisms for reporting that something went wrong with a
`tools/call`. Choosing the correct one is a MUST. (R-22.5-a, AC-34.18)

## Type Declaration

### PROTOCOL\_ERROR

> `readonly` **PROTOCOL\_ERROR**: `"protocol-error"` = `'protocol-error'`

A JSON-RPC `error` (`-32602`): the request could not be dispatched. (R-22.5-c)

### ERROR\_RESULT

> `readonly` **ERROR\_RESULT**: `"error-result"` = `'error-result'`

A successful `result` with `isError: true`: the tool ran but failed. (R-22.5-b)
