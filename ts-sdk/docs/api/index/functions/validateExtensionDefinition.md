[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateExtensionDefinition

# Function: validateExtensionDefinition()

> **validateExtensionDefinition**(`def`): [`ExtensionDefinitionValidation`](../type-aliases/ExtensionDefinitionValidation.md)

Defined in: [protocol/extension-mechanism.ts:668](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L668)

Validates that an [ExtensionDefinition](../interfaces/ExtensionDefinition.md) conforms to the §24 framework:
a valid identifier, namespaced methods, controlled `_meta` keys, and no
redefinition of core surface. (R-24-a, R-24.5-b, R-24.5-d, R-24.5-e, R-24.5-i)

Checks, accumulating ALL violations:
  - the identifier is well-formed (R-24.2-a..d via [isValidExtensionId](isValidExtensionId.md));
  - every method is in the identifier-derived namespace (R-24.5-b);
  - every `_meta` key is under a prefix the extension controls (R-24.5-d);
  - no `resultType` collides with a core value — that would redefine core
    surface (R-24.5-i; a new value MUST be additional, R-24.5-e);
  - the extension classification, when present, is recognized (R-24.1-a).

This is the mechanism by which "a non-conforming extension is rejected by the
conformance suite" (AC-38.1) and "surface added outside the mechanism is
flagged non-conformant" (AC-38.5) are realized for a declared surface.

## Parameters

### def

[`ExtensionDefinition`](../interfaces/ExtensionDefinition.md)

## Returns

[`ExtensionDefinitionValidation`](../type-aliases/ExtensionDefinitionValidation.md)
