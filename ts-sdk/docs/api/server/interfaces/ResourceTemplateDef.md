[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / ResourceTemplateDef

# Interface: ResourceTemplateDef

Defined in: server/server.ts:142

## Extends

- [`ResourceDef`](ResourceDef.md)

## Properties

### title?

> `optional` **title?**: `string`

Defined in: server/server.ts:132

#### Inherited from

[`ResourceDef`](ResourceDef.md).[`title`](ResourceDef.md#title)

***

### description?

> `optional` **description?**: `string`

Defined in: server/server.ts:133

#### Inherited from

[`ResourceDef`](ResourceDef.md).[`description`](ResourceDef.md#description)

***

### mimeType?

> `optional` **mimeType?**: `string`

Defined in: server/server.ts:134

#### Inherited from

[`ResourceDef`](ResourceDef.md).[`mimeType`](ResourceDef.md#mimetype)

***

### uriTemplate

> **uriTemplate**: `string`

Defined in: server/server.ts:143

***

### complete?

> `optional` **complete?**: `Record`\<`string`, (`value`) => `string`[]\>

Defined in: server/server.ts:145

Completion callbacks per template variable.
