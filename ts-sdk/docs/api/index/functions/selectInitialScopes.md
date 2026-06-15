[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / selectInitialScopes

# Function: selectInitialScopes()

> **selectInitialScopes**(`options`): `string` \| `undefined`

Defined in: [protocol/authorization-registration.ts:765](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L765)

Selects the least-privilege scopes for the initial authorization handshake,
applying the §23.18 priority: the `WWW-Authenticate` challenge `scope` (treated
as authoritative, with no assumed relationship to `scopes_supported`), else all
of `scopes_supported`, else omit the `scope` parameter entirely. (R-23.18-a,
R-23.18-b, R-23.18-c, R-23.18-d)

Delegates to S36's [resolveAuthorizationScope](resolveAuthorizationScope.md), whose priority order is
identical; surfaced here under the §23.18 atoms. Returns `undefined` to signal
the `scope` parameter is omitted (R-23.18-d).

## Parameters

### options

#### challenge?

[`WwwAuthenticateChallenge`](../interfaces/WwwAuthenticateChallenge.md)

The parsed `WWW-Authenticate` challenge, if any.

#### protectedResource?

`Pick`\<`objectOutputType`\<\{ `resource`: `ZodString`; `authorization_servers`: `ZodArray`\<`ZodString`, `"many"`\>; `scopes_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `bearer_methods_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `"scopes_supported"`\>

Protected-resource metadata, if any.

## Returns

`string` \| `undefined`
