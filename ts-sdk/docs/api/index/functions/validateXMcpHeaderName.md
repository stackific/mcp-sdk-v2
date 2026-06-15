[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateXMcpHeaderName

# Function: validateXMcpHeaderName()

> **validateXMcpHeaderName**(`name`): [`XMcpHeaderNameResult`](../type-aliases/XMcpHeaderNameResult.md)

Defined in: [transport/http/param-headers.ts:113](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L113)

Validates one `x-mcp-header` name against §9.5.1: non-empty (R-9.5.1-a),
`1*tchar` (R-9.5.1-b), and free of control characters including CR/LF
(R-9.5.1-c, subsumed by the token grammar).

## Parameters

### name

`unknown`

## Returns

[`XMcpHeaderNameResult`](../type-aliases/XMcpHeaderNameResult.md)
