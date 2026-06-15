[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / issuerValidationDecision

# Function: issuerValidationDecision()

> **issuerValidationDecision**(`issParameterSupported`, `issPresent`): [`IssuerValidationDecision`](../type-aliases/IssuerValidationDecision.md)

Defined in: [protocol/authorization-flow.ts:1013](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1013)

Applies the §23.7 four-row decision table to determine how to treat the `iss`
parameter, given whether the authorization server advertises
`authorization_response_iss_parameter_supported` and whether `iss` is present.
(R-23.7-d, R-23.7-e, R-23.7-f)

| supported | iss present | decision |
| --------- | ----------- | -------- |
| true      | yes         | compare  |
| true      | no          | reject   |
| false     | yes         | compare  |
| false     | no          | proceed  |

A present `iss` is ALWAYS compared, regardless of advertisement (R-23.7-f).

## Parameters

### issParameterSupported

`boolean` \| `undefined`

The AS metadata flag (`undefined` ⇒ not advertised).

### issPresent

`boolean`

Whether the response carried an `iss`.

## Returns

[`IssuerValidationDecision`](../type-aliases/IssuerValidationDecision.md)
