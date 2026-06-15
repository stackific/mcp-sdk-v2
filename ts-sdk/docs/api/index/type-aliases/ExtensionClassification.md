[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionClassification

# Type Alias: ExtensionClassification

> **ExtensionClassification** = `"modular"` \| `"specialized"` \| `"experimental"`

Defined in: [protocol/extension-mechanism.ts:191](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L191)

The three (non-exclusive) ways an extension may be characterized. (§24.1,
R-24.1-a) An extension is classifiable as one of these; the value is purely
descriptive and does not affect negotiation.

  - `modular`      — a discrete capability;
  - `specialized`  — domain- or industry-specific behavior;
  - `experimental` — incubated for possible future inclusion in the core.
