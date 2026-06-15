[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resourceTemplateVariableNamesOf

# Function: resourceTemplateVariableNamesOf()

> **resourceTemplateVariableNamesOf**(`template`, `extractVariables`): `string`[]

Defined in: [protocol/completion.ts:795](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L795)

Returns the URI-template variable names of a `ResourceTemplate` for use in a
[CompletionCatalog](../interfaces/CompletionCatalog.md). The variable extraction itself is owned by S26
(`uriTemplateVariables`); this only narrows the field a caller passes in. A
literal URI (no `{…}` variables) yields `[]`. (R-19.3-e, R-19.5-r via §17.4)

Pass the already-extracted variable names (e.g. from S26's
`uriTemplateVariables(template.uriTemplate)`) — this helper exists so callers
keep the S26 binding as the single source of template-variable parsing.

## Parameters

### template

`Pick`\<[`ResourceTemplate`](../type-aliases/ResourceTemplate.md), `"uriTemplate"`\>

### extractVariables

(`uriTemplate`) => readonly `string`[]

## Returns

`string`[]
