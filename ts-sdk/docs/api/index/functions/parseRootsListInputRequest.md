[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseRootsListInputRequest

# Function: parseRootsListInputRequest()

> **parseRootsListInputRequest**(`value`): `SafeParseReturnType`\<`unknown`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/roots.ts:257](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L257)

Validates a `roots/list` input request — the request a server embeds in an
input-required result to obtain roots. (§21.1.4; AC-32.8, AC-32.9)

⚠️ DEPRECATED. Built on `RootsListInputRequestSchema` (S17): `method` is
REQUIRED and MUST be exactly `"roots/list"` (R-21.1.4-a); `params` is
OPTIONAL, carries no roots-specific members, and MAY carry only the common
`_meta` member (R-21.1.4-b). A receiver MUST tolerate the ABSENCE of `params`
(R-21.1.4-c) — the underlying schema marks it `.optional()`, so a request
with no `params` parses successfully.

## Parameters

### value

`unknown`

The candidate input request.

## Returns

`SafeParseReturnType`\<`unknown`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"roots/list"`\>; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

A discriminated result; `.success` is `false` for a wrong/miscased
  `method` or a non-object `params`.
