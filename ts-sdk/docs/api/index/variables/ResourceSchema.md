[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceSchema

# Variable: ResourceSchema

> `const` **ResourceSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/resources.ts:331](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L331)

A concrete, directly readable resource identified by a URI. Includes the
`BaseMetadata` fields (`name` REQUIRED, `title` OPTIONAL) and the icon array.
(§17.4)

Fields (R-17.4-a – R-17.4-l):
  - `uri` REQUIRED, RFC3986 URI string of any scheme. (R-17.4-a, R-17.4-b)
  - `name` REQUIRED programmatic identifier; `title` OPTIONAL display name
    (both from `BaseMetadata`; prefer `title` then fall back to `name`).
    (R-17.4-c, R-17.4-d, R-17.4-e)
  - `description` OPTIONAL prose hint to the model. (R-17.4-f)
  - `mimeType` OPTIONAL content MIME type, if known. (R-17.4-g)
  - `size` OPTIONAL raw byte count measured BEFORE base64/tokenization; a host
    MAY use it for file sizes and context-window estimates. (R-17.4-h, R-17.4-i)
  - `annotations` OPTIONAL `Annotations` hints. (R-17.4-j)
  - `icons` OPTIONAL `Icon[]` for display. (R-17.4-k)
  - `_meta` OPTIONAL reserved metadata map. (R-17.4-l)

Composed by extending `BaseMetadataSchema` so `name`/`title` come from the one
canonical S20 definition rather than being re-typed. `.passthrough()` preserves
forward-compatible members.
