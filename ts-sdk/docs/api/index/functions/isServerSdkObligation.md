[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isServerSdkObligation

# Function: isServerSdkObligation()

> **isServerSdkObligation**(`concern`): concern is "declare-ui-meta" \| "serve-ui-resource" \| "acknowledge-extension"

Defined in: [protocol/ui-host.ts:1221](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1221)

Returns `true` when `concern` is a SERVER-SDK obligation under this extension
(one of [SERVER\_SDK\_OBLIGATIONS](../variables/SERVER_SDK_OBLIGATIONS.md)); returns `false` for any host-only
concern. A server-SDK conformance check uses this to confirm that sandboxing,
CSP/permission enforcement, the dialect runtime, and consent are NOT required
of the server SDK. (§26.9, R-26.9-d; AC-42.25)

## Parameters

### concern

`string`

A server obligation or host-only concern name.

## Returns

concern is "declare-ui-meta" \| "serve-ui-resource" \| "acknowledge-extension"
