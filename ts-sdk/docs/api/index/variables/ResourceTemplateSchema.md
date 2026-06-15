[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceTemplateSchema

# Variable: ResourceTemplateSchema

> `const` **ResourceTemplateSchema**: `ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/resources.ts:381](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L381)

A family of resources whose URIs are produced by expanding a URI Template
[RFC6570]. Includes `BaseMetadata` and icon fields, and — unlike `Resource` —
carries NO `size` field (size is a property of a concrete resource, not a
template). (§17.4, R-17.4-u)

Fields (R-17.4-m – R-17.4-t):
  - `uriTemplate` REQUIRED RFC6570 template expanded into a concrete `uri`. The
    client substitutes values for the named `{…}` variables, which MAY come from
    the user, computation, or completion (§19). (R-17.4-m, R-17.4-n)
  - `name` REQUIRED, `title` OPTIONAL (`BaseMetadata`). (R-17.4-o, R-17.4-p)
  - `description` OPTIONAL prose hint. (R-17.4-q)
  - `mimeType` OPTIONAL; SHOULD be set only when ALL matching resources share it.
    (R-17.4-r, R-17.4-s)
  - `annotations`, `icons`, `_meta` OPTIONAL, as for `Resource`. (R-17.4-t)

`.strict()` is NOT used (forward-compatible members are allowed via
`.passthrough()`); the absence of `size` is a definitional property enforced by
[resourceTemplateHasNoSize](../functions/resourceTemplateHasNoSize.md) rather than by schema rejection, since
`.passthrough()` would otherwise carry an unknown `size` through.
