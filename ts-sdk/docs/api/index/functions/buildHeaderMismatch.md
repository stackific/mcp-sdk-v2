[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildHeaderMismatch

# Function: buildHeaderMismatch()

> **buildHeaderMismatch**(`message?`): [`HttpRejection`](../interfaces/HttpRejection.md)

Defined in: [transport/http/headers.ts:98](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L98)

Builds a `HeaderMismatch` (`-32001`) rejection (HTTP `400`). (§9.3–§9.4)

## Parameters

### message?

`string` = `'Header does not match request body'`

## Returns

[`HttpRejection`](../interfaces/HttpRejection.md)
