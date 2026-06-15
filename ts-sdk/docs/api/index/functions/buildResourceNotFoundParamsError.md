[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildResourceNotFoundParamsError

# Function: buildResourceNotFoundParamsError()

> **buildResourceNotFoundParamsError**(`uri`, `message?`): [`JsonRpcErrorObject`](../interfaces/JsonRpcErrorObject.md) & `object`

Defined in: [protocol/errors.ts:472](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L472)

Builds a `-32602` Invalid params resource-not-found error whose `data`
includes the requested `uri`, per the §22.4 canonical mapping. (R-22.4-g,
R-22.4-h, AC-34.15, AC-34.16) A non-existent resource MUST be signaled this
way and MUST NOT be signaled by an empty `contents` array. (R-22.4-i)

## Parameters

### uri

`string`

The requested resource URI that was not found.

### message?

`string` = `'Resource not found'`

Optional override; defaults to `"Resource not found"`.

## Returns

[`JsonRpcErrorObject`](../interfaces/JsonRpcErrorObject.md) & `object`
