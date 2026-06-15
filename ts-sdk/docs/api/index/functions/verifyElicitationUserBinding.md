[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / verifyElicitationUserBinding

# Function: verifyElicitationUserBinding()

> **verifyElicitationUserBinding**(`mcpSessionSubject`, `browserSessionSubject`): [`ElicitationUserBindingResult`](../type-aliases/ElicitationUserBindingResult.md)

Defined in: [protocol/elicitation-form.ts:1408](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1408)

Verifies, for a URL-mode elicitation, that the user who opened the URL is the
same user who started the elicitation — the §20.7 cross-user anti-phishing
check. (§20.7, R-20.7-j – R-20.7-o)

The server MUST compare server-side-verified subjects (e.g. the authoritative
`sub` of the MCP session vs the `sub` of the browser session that opened the
URL), NOT any identity carried in the URL (R-20.7-n, R-20.7-o); both inputs
here are expected to be authoritative subjects the caller resolved through its
authorization server. A missing/empty subject yields `unverified-identity`
(R-20.7-k); differing subjects yield `subject-mismatch` (R-20.7-m).

## Parameters

### mcpSessionSubject

`string` \| `undefined`

Authoritative `sub` of the MCP session that
  started the elicitation.

### browserSessionSubject

`string` \| `undefined`

Authoritative `sub` of the browser session that
  opened the elicitation URL.

## Returns

[`ElicitationUserBindingResult`](../type-aliases/ElicitationUserBindingResult.md)
