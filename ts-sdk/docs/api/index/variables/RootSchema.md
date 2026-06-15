[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RootSchema

# Variable: RootSchema

> `const` **RootSchema**: `ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/roots.ts:343](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L343)

A single exposed root entry. (§21.1.5; AC-32.11, AC-32.13, AC-32.14)

⚠️ DEPRECATED. Identifies a directory or file the client considers relevant.
Roots are informational guidance, NOT an enforced access boundary.

Fields:
  `uri`   REQUIRED string. MUST begin with `file://` and be a syntactically
          valid URI per RFC 3986. (R-21.1.5-b, R-21.1.5-d · MUST; AC-32.11)
  `name`  OPTIONAL human-readable display name; when absent, no display name
          is implied. (R-21.1.5-e · OPTIONAL; AC-32.13)
  `_meta` OPTIONAL implementation-defined metadata map; a receiver MUST
          IGNORE members it does not recognize — `.passthrough()` preserves
          them through parse. (R-21.1.5-f · MUST; AC-32.14)

This is the strongly-validated `file://` form. The S17 `ListRootsResultSchema`
accepts any string `uri` (it owns only the array-presence constraint); this
schema layers the §21.1 `file://` + RFC 3986 constraint via a refinement.
