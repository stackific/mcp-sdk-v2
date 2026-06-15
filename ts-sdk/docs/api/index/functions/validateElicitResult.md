[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateElicitResult

# Function: validateElicitResult()

> **validateElicitResult**(`result`, `mode`, `requestedSchema?`): [`ElicitResultValidation`](../type-aliases/ElicitResultValidation.md)

Defined in: [protocol/elicitation-form.ts:874](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L874)

Validates a returned `ElicitResult` against the §20.5 action/content rules for
the mode it answers. (§20.5, R-20.5-a, R-20.5-b, R-20.5-c)

Enforced:
  - `action` is REQUIRED and exactly one of `"accept"` / `"decline"` /
    `"cancel"`. (R-20.5-a)
  - `content` is permitted ONLY when `action === "accept"` and the mode is
    `"form"`; a URL-mode accept, a decline, or a cancel carrying `content` is
    malformed. (R-20.5-b)
  - When `content` is present (form-mode accept), it conforms to
    `requestedSchema` per [validateElicitContent](validateElicitContent.md) — supply
    `requestedSchema` to enable this check. (R-20.5-c)

## Parameters

### result

`unknown`

The `ElicitResult` returned by the client.

### mode

[`ElicitationMode`](../type-aliases/ElicitationMode.md)

The mode of the originating request (`"form"` | `"url"`).

### requestedSchema?

`unknown`

The form-mode `requestedSchema` (used only to check
  `content` conformance on a form-mode accept).

## Returns

[`ElicitResultValidation`](../type-aliases/ElicitResultValidation.md)
