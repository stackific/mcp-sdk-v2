[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / checkElicitationUrlSafety

# Function: checkElicitationUrlSafety()

> **checkElicitationUrlSafety**(`url`, `options?`): [`ElicitationUrlSafety`](../type-aliases/ElicitationUrlSafety.md)

Defined in: [protocol/elicitation-form.ts:1258](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1258)

Checks a server-constructed elicitation URL against the §20.7 safe-construction
rules: it MUST NOT carry sensitive end-user info, MUST NOT be pre-authenticated
to a protected resource, and SHOULD use HTTPS outside development.
(§20.7, R-20.7-p, R-20.7-q, R-20.7-s)

Heuristics flag credential/PII-looking query parameters and embedded userinfo
(`user:pass@host`), and (outside `allowInsecure`) any non-`https:` scheme. This
is a guard to catch obvious mistakes, not a guarantee of safety.

## Parameters

### url

`unknown`

The elicitation URL the server intends to send.

### options?

`allowInsecure: true` permits non-HTTPS (development only).

#### allowInsecure?

`boolean`

## Returns

[`ElicitationUrlSafety`](../type-aliases/ElicitationUrlSafety.md)
