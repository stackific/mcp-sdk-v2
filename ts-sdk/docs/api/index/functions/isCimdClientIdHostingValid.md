[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCimdClientIdHostingValid

# Function: isCimdClientIdHostingValid()

> **isCimdClientIdHostingValid**(`clientIdUrl`): `boolean`

Defined in: [protocol/authorization-registration.ts:239](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L239)

Returns `true` when `clientIdUrl` satisfies the CIMD client-side hosting rules:
it is hosted at an `https` URL and the URL contains a path component. (R-23.12-b,
R-23.12-c)

Delegates the `https`+path check to S36's `isValidCimdClientIdUrl`; surfaced
here under the §23.12 atom so call sites read against this story's rule.

## Parameters

### clientIdUrl

`string`

The CIMD `client_id` URL.

## Returns

`boolean`
