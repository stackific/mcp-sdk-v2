[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateRequestOrigin

# Function: validateRequestOrigin()

> **validateRequestOrigin**(`origin`, `acceptedOrigins`): \{ `accepted`: `true`; \} \| \{ `accepted`: `false`; `origin`: `string`; \}

Defined in: [protocol/security.ts:1423](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1423)

Validates an `Origin` header against the server's accepted-origin set on every
incoming HTTP connection, rejecting untrusted origins to defend against
DNS-rebinding — the §28.10-i restatement of the §9.11 rule. (§28.10, R-28.10-i;
AC-44.26)

Returns `{ accepted: false }` when the `Origin` header is present and not in the
accepted set (the request MUST be rejected); an absent `Origin` or one in the set
passes, matching exactly. §9.11 (S15) owns the rule in full and the transport
layer's `validateOrigin`; this is the protocol-level predicate §28.10 references
so a server's request pipeline can assert it.

## Parameters

### origin

`string` \| `undefined`

The request's `Origin` header value, or `undefined`.

### acceptedOrigins

`Iterable`\<`string`\>

The origins the server is configured to accept.

## Returns

\{ `accepted`: `true`; \} \| \{ `accepted`: `false`; `origin`: `string`; \}
