[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / generateCodeVerifier

# Function: generateCodeVerifier()

> **generateCodeVerifier**(`randomSource?`): `string`

Defined in: [protocol/authorization-flow.ts:149](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L149)

Generates a high-entropy PKCE `code_verifier`. (R-23.5-b)

32 random bytes BASE64URL-encode to a 43-character string drawn entirely from
the unreserved alphabet — the RFC 7636 minimum length and recommended entropy.
Randomness is injectable (`randomSource`) so callers can produce a deterministic
verifier in tests; the default draws from `node:crypto`'s CSPRNG.

## Parameters

### randomSource?

(`size`) => `Buffer`

OPTIONAL byte source `(n) => Buffer of length n`; defaults
  to `node:crypto` `randomBytes`.

## Returns

`string`

## Throws

When an injected `randomSource` yields a verifier outside
  the 43–128 unreserved-char range.
