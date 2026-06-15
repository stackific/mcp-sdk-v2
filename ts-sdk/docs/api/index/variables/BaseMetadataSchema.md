[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / BaseMetadataSchema

# Variable: BaseMetadataSchema

> `const` **BaseMetadataSchema**: `ZodObject`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `title?`: `string`; \}, \{ `name`: `string`; `title?`: `string`; \}\>

Defined in: [types/base-metadata.ts:20](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/base-metadata.ts#L20)

`BaseMetadata` schema — the minimal name/title identity pair (§14.1).
All §14 field names are case-sensitive and MUST be reproduced exactly. (R-14-a)
