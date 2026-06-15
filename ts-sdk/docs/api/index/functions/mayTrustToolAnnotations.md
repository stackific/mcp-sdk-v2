[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayTrustToolAnnotations

# Function: mayTrustToolAnnotations()

> **mayTrustToolAnnotations**(`serverIsTrusted?`): `boolean`

Defined in: [protocol/tools-call.ts:574](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L574)

The untrusted-annotations rule: a client MUST treat tool annotations as
untrusted and MUST NOT make tool-use or safety decisions based on annotations
received from a server it does not trust. Returns `true` ONLY when the server
is explicitly trusted — so a caller gating a safety decision on annotations
fails closed for any untrusted server. (§16.7, R-16.7-f, R-16.7-g)

Annotations are HINTS, never guaranteed to be faithful (including `title`);
this predicate makes the trust boundary explicit at the decision site.

## Parameters

### serverIsTrusted?

`boolean` = `false`

Whether the application trusts the server that sent
  the annotations. Defaults to `false` (fail closed).

## Returns

`boolean`
