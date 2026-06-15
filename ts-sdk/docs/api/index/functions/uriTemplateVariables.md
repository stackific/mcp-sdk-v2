[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / uriTemplateVariables

# Function: uriTemplateVariables()

> **uriTemplateVariables**(`template`): `string`[]

Defined in: [protocol/resources.ts:283](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L283)

Extracts the variable names referenced by a URI Template's `{…}` expressions,
in first-seen order with duplicates removed. Useful for driving completion
(§19) or prompting the user for values before expansion. (§17.4, R-17.4-n)

Returns `[]` for a template with no expressions. Modifiers (`*`, `:N`) and the
leading operator are stripped from the reported names.

## Parameters

### template

`string`

## Returns

`string`[]
