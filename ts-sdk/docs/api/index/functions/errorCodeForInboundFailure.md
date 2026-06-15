[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / errorCodeForInboundFailure

# Function: errorCodeForInboundFailure()

> **errorCodeForInboundFailure**(`stage`): `number`

Defined in: [protocol/errors.ts:601](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L601)

Selects the authoritative `error.code` for a failed-inbound-message stage,
per the §22.6 transport mapping. (R-22.6-b, R-22.6-c, R-22.6-d, R-22.6-e,
R-22.6-f, AC-34.21, AC-34.22)

  - `unparseable-json`      → `-32700` Parse error
  - `invalid-request-object`→ `-32600` Invalid Request
  - `routing-header`        → `-32001` HeaderMismatch (HTTP transport)
  - `invalid-metadata`      → `-32602` Invalid params

## Parameters

### stage

[`InboundFailureStage`](../type-aliases/InboundFailureStage.md)

## Returns

`number`
