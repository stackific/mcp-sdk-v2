[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertElicitationUnderUserControl

# Function: assertElicitationUnderUserControl()

> **assertElicitationUnderUserControl**(`options`): [`ElicitationControlValidation`](../type-aliases/ElicitationControlValidation.md)

Defined in: [protocol/security.ts:1074](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1074)

Asserts a server-initiated elicitation remained under user control before
anything was returned to the server: the user could review and reach an explicit
decision (approve/edit/decline/cancel), the requesting server's identity was
shown, and the request did not phish for secrets via form mode. (§28.7,
R-28.7-a, R-28.7-b, R-28.7-c, R-28.7-d, R-28.7-e; AC-44.19)

Delegates the form-mode anti-phishing check to S31's [assertFormModeMayCollect](assertFormModeMayCollect.md)
(a server MUST NOT use a form to collect credentials/secrets — that belongs in URL
mode). Returns the first violation; a `decline`/`cancel` decision is always
permitted (the user may stop at any point) and returns `ok: true` without
requiring the schema to be safe, since nothing is returned to the server.

## Parameters

### options

#### decision

[`ElicitationUserDecision`](../type-aliases/ElicitationUserDecision.md)

The user's terminal decision (R-28.7-b, R-28.7-c).

#### userCouldReview

`boolean`

The user was able to review the request before deciding (R-28.7-b).

#### serverIdentityShown

`boolean`

The requesting server's identity was made clear (R-28.7-e).

#### requestedSchema?

`unknown`

The form-mode requestedSchema, checked for secret-phishing (R-28.7-d).

## Returns

[`ElicitationControlValidation`](../type-aliases/ElicitationControlValidation.md)
