[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildWwwAuthenticateValue

# Function: buildWwwAuthenticateValue()

> **buildWwwAuthenticateValue**(`challenge`): `string`

Defined in: [protocol/authorization.ts:398](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L398)

Builds the `WWW-Authenticate` header value for a `Bearer` challenge from its
structured fields. (R-23.1-u – R-23.1-w, R-23.1-ab – R-23.1-ad)

Parameters are emitted in a stable order — `error`, `scope`,
`resource_metadata`, `error_description` — each only when present. The scheme
(`Bearer`) always leads.

## Parameters

### challenge

`Omit`\<[`WwwAuthenticateChallenge`](../interfaces/WwwAuthenticateChallenge.md), `"scheme"`\> & `object`

The structured challenge fields.

## Returns

`string`
