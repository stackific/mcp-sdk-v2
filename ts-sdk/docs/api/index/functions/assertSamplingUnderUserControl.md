[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertSamplingUnderUserControl

# Function: assertSamplingUnderUserControl()

> **assertSamplingUnderUserControl**(`options`): [`SamplingControlValidation`](../type-aliases/SamplingControlValidation.md)

Defined in: [protocol/security.ts:1122](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1122)

Asserts a server-driven sampling flow remained under user control: the MUST-level
§28.7 obligations are met (human review of prompt and completion before they are
acted upon or transmitted) and the host disclosed no more conversation context
than the user authorized. (§28.7, R-28.7-a, R-28.7-f, R-28.7-g; AC-44.20)

Reuses S33's [unmetRequiredConsentObligations](unmetRequiredConsentObligations.md) for the human-in-the-loop /
user-may-deny / sensitive-data MUSTs, and additionally requires the prompt and
completion to have been human-reviewed (R-28.7-f) and the disclosed context to be
within the user's authorization (R-28.7-g).

## Parameters

### options

#### obligations

[`SamplingConsentObligations`](../interfaces/SamplingConsentObligations.md)

The host's §21.2.10 consent-obligation claims (S33). (R-28.7-a)

#### promptReviewed

`boolean`

The prompt sent to the model was human-reviewed/approved. (R-28.7-f)

#### completionReviewed

`boolean`

The completion was human-reviewed before being acted upon. (R-28.7-f)

#### disclosedContextWithinAuthorization

`boolean`

The disclosed conversation context was within
  what the user authorized. (R-28.7-g)

## Returns

[`SamplingControlValidation`](../type-aliases/SamplingControlValidation.md)
