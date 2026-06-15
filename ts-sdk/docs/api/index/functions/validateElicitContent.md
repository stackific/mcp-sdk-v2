[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateElicitContent

# Function: validateElicitContent()

> **validateElicitContent**(`content`, `requestedSchema`): [`ElicitContentValidation`](../type-aliases/ElicitContentValidation.md)

Defined in: [protocol/elicitation-form.ts:740](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L740)

Validates an accepted form-mode `content` map against the `requestedSchema` it
answers, enforcing the §20.5 conformance rule: every value is a string, number,
boolean, or array of strings; every value matches the type/constraints of its
field; every `required` field is present; and no unknown field appears.
(§20.5, R-20.5-c)

Checked per field, by the field's primitive kind:
  - `string`  — value is a string; honors `minLength`/`maxLength`; `format` is
    a hint and is not strictly enforced here.
  - `number`  — value is a number (and an integer when `type: "integer"`);
    honors `minimum`/`maximum`.
  - `boolean` — value is a boolean.
  - `enum`    — single-select: a string that is one of the permitted values;
    multi-select: an array of strings, each a permitted value, honoring
    `minItems`/`maxItems`.

Both a client (before sending, R-20.5-i) and a server (on receipt, R-20.5-j)
SHOULD run this. `requestedSchema` itself is validated as a restricted form
schema first; an invalid schema yields a `<root>` error.

## Parameters

### content

`unknown`

The `ElicitResult.content` map to validate.

### requestedSchema

`unknown`

The `requestedSchema` the content answers.

## Returns

[`ElicitContentValidation`](../type-aliases/ElicitContentValidation.md)
