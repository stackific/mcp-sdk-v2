[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ValidateIssuerOptions

# Interface: ValidateIssuerOptions

Defined in: [protocol/authorization-flow.ts:1029](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1029)

Inputs to [validateIssuer](../functions/validateIssuer.md).

## Properties

### iss?

> `optional` **iss?**: `string`

Defined in: [protocol/authorization-flow.ts:1031](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1031)

The decoded `iss` from the authorization response, if any. (R-23.7-g)

***

### recordedIssuer

> **recordedIssuer**: `string`

Defined in: [protocol/authorization-flow.ts:1033](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1033)

The `issuer` recorded in Step 1. (R-23.5-c)

***

### issParameterSupported?

> `optional` **issParameterSupported?**: `boolean`

Defined in: [protocol/authorization-flow.ts:1038](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1038)

The AS metadata `authorization_response_iss_parameter_supported` flag, if
advertised. (R-23.7-c)
