[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveAuthorizationScope

# Function: resolveAuthorizationScope()

> **resolveAuthorizationScope**(`options`): `string` \| `undefined`

Defined in: [protocol/authorization-flow.ts:692](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L692)

Resolves the `scope` parameter to send in the authorization request, applying
the scope-priority rule. (R-23.5-f)

  1. If the `WWW-Authenticate` challenge carried a `scope`, use that.
  2. Otherwise use all scopes in `scopes_supported` from protected-resource
     metadata.
  3. When neither is available, omit `scope` (returns `undefined`).

Callers MAY then add `offline_access` to request refresh capability when the
authorization-server metadata advertises it (see [withOfflineAccessScope](withOfflineAccessScope.md)).
(R-23.9-b)

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
