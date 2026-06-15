[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionChangeKind

# Type Alias: ExtensionChangeKind

> **ExtensionChangeKind** = `"add-optional-field"` \| `"add-capability-flag"` \| `"remove-field"` \| `"rename-field"` \| `"change-type"` \| `"change-semantics"` \| `"add-required-field"`

Defined in: [protocol/extension-mechanism.ts:493](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L493)

The kinds of change that are INCOMPATIBLE and therefore SHOULD be published
under a new identifier rather than evolved within one. (R-24.6-d)

  - `remove-field` / `rename-field` — removing or renaming a field;
  - `change-type`                   — changing a field's type;
  - `change-semantics`              — altering existing behavior's meaning;
  - `add-required-field`            — adding a new REQUIRED field.
