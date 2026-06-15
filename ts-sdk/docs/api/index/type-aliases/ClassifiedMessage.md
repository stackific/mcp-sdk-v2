[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ClassifiedMessage

# Type Alias: ClassifiedMessage

> **ClassifiedMessage** = \{ `kind`: `"request"`; `message`: [`JSONRPCRequest`](JSONRPCRequest.md); \} \| \{ `kind`: `"notification"`; `message`: [`JSONRPCNotification`](JSONRPCNotification.md); \} \| \{ `kind`: `"result-response"`; `message`: [`JSONRPCResultResponse`](JSONRPCResultResponse.md); \} \| \{ `kind`: `"error-response"`; `message`: [`JSONRPCErrorResponse`](JSONRPCErrorResponse.md); \}

Defined in: [jsonrpc/framing.ts:150](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L150)

Returned by `classifyMessage` when the message is valid.
