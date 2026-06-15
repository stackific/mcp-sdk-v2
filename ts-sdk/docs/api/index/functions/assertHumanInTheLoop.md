[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertHumanInTheLoop

# Function: assertHumanInTheLoop()

> **assertHumanInTheLoop**(`options`): [`HumanInTheLoopValidation`](../type-aliases/HumanInTheLoopValidation.md)

Defined in: [protocol/security.ts:507](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L507)

Asserts the human-in-the-loop invariant for a proposed tool invocation: the user
could review and understand it and the decision did not rest solely with the
model. (§28.3, R-28.3-d, R-28.3-e; AC-44.8)

Returns `ok: false` when the user was not given the opportunity to review/deny,
or when the model alone drove the invocation with no human gate — both of which
MUST NOT happen. This is the backstop that prevents prompt-injection-induced
requests from executing without review (R-28.3-f).

## Parameters

### options

#### userCouldReviewAndDeny

`boolean`

The user was able to review, understand,
  and deny the invocation before it ran. (R-28.3-d)

#### modelDecidedAlone

`boolean`

The invocation decision rested solely with
  the model, with no human gate. (R-28.3-e)

## Returns

[`HumanInTheLoopValidation`](../type-aliases/HumanInTheLoopValidation.md)
