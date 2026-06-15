[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / evaluateConsent

# Function: evaluateConsent()

> **evaluateConsent**(`request`, `priorGrant?`): [`ConsentDecision`](../type-aliases/ConsentDecision.md)

Defined in: [protocol/security.ts:374](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L374)

The host consent gate every operation acting on the user's behalf passes before
it reaches a server. (§28.2, R-28.2-a, R-28.2-b, R-28.2-c, R-28.2-d, R-28.2-e,
R-28.2-f; AC-44.2, AC-44.7)

Allows the operation ONLY when one of:
  - it matches a prior grant for the SAME operation and SAME scope — already
    authorized, no re-prompt needed; or
  - the user freshly, informedly approved THIS proposal (`userApproved === true`).

Denies, with a reason, when:
  - no prior grant and no fresh approval → `no-consent`: absence of refusal is
    never consent (R-28.2-d);
  - a fresh approval that is not informed → `not-informed` (R-28.2-b);
  - a prior grant exists for the operation but the scope differs materially and
    there is no fresh approval → `material-change`/`silent-escalation`: the host
    MUST seek fresh consent and MUST NOT silently escalate (R-28.2-e, R-28.2-f).

The gate never treats a missing `userApproved` as approval, so a caller cannot
accidentally let silence through.

## Parameters

### request

[`ConsentRequest`](../interfaces/ConsentRequest.md)

The proposed operation and whether it was freshly approved.

### priorGrant?

[`ConsentGrant`](../interfaces/ConsentGrant.md)

## Returns

[`ConsentDecision`](../type-aliases/ConsentDecision.md)
