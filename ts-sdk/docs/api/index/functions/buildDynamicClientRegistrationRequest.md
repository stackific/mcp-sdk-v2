[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildDynamicClientRegistrationRequest

# ~~Function: buildDynamicClientRegistrationRequest()~~

> **buildDynamicClientRegistrationRequest**(`options`): `objectOutputType`

Defined in: [protocol/authorization-flow.ts:467](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L467)

Builds a Dynamic Client Registration request body, always including the REQUIRED
`application_type`. (R-23.4-m)

## Parameters

### options

[`DynamicClientRegistrationRequestOptions`](../interfaces/DynamicClientRegistrationRequestOptions.md)

Registration inputs.

## Returns

`objectOutputType`

## Deprecated

Dynamic Client Registration is Deprecated (§27.3). Use static
OAuth 2.0 client registration instead. Earliest removal: 2026-07-28
(§27.2/§27.3, R-27.4-a/-b).
