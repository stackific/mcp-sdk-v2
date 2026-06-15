[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildDeclineErrorResponse

# Function: buildDeclineErrorResponse()

> **buildDeclineErrorResponse**(`id`, `reason`, `message?`): [`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)

Defined in: [protocol/ui-host.ts:882](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L882)

Builds the §22 error response a host returns when it DECLINES a UI-initiated
request, instead of silently dropping it. The code is selected from `reason`
by [declineErrorCode](declineErrorCode.md). (§26.8, R-26.8-b; AC-42.20)

## Parameters

### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

The request id being declined.

### reason

[`DeclineReason`](../type-aliases/DeclineReason.md)

Why the host declined.

### message?

`string`

OPTIONAL human-readable message.

## Returns

[`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)
