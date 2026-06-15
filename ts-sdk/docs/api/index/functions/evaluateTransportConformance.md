[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / evaluateTransportConformance

# Function: evaluateTransportConformance()

> **evaluateTransportConformance**(`transport`): [`TransportConformance`](../interfaces/TransportConformance.md)

Defined in: [protocol/conformance-requirements.ts:815](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L815)

Evaluates the authorization-applicability conformance points for a single
transport. (§29.8 items 4 & 5, R-29.8-d, R-29.8-e) Reuses S35's
[authorizationAppliesTo](authorizationAppliesTo.md)/[authorizationForbiddenFor](authorizationForbiddenFor.md)/
[credentialConveyanceFor](credentialConveyanceFor.md) so the HTTP-vs-stdio rule has one source of
truth: an HTTP-based transport SHOULD conform to authorization; a stdio
transport SHOULD NOT apply it and obtains credentials from its environment.

## Parameters

### transport

[`ConformanceTransport`](../type-aliases/ConformanceTransport.md)

## Returns

[`TransportConformance`](../interfaces/TransportConformance.md)
