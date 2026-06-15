[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionDefinition

# Interface: ExtensionDefinition

Defined in: [protocol/extension-mechanism.ts:620](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L620)

A declarative description of the surface a single extension contributes — the
machine-checkable form of "an active extension MAY extend the surface ONLY in
the four enumerated ways" (§24.5). A conformance suite can validate an
extension's claimed surface against the framework using [validateExtensionDefinition](../functions/validateExtensionDefinition.md).

## Properties

### identifier

> **identifier**: `string`

Defined in: [protocol/extension-mechanism.ts:622](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L622)

The extension's globally unique identifier (§24.2).

***

### classification?

> `optional` **classification?**: [`ExtensionClassification`](../type-aliases/ExtensionClassification.md)

Defined in: [protocol/extension-mechanism.ts:624](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L624)

How the extension is characterized (§24.1).

***

### methods?

> `optional` **methods?**: readonly `string`[]

Defined in: [protocol/extension-mechanism.ts:626](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L626)

Channel 1 — request methods and notifications the extension defines (R-24.5-b).

***

### metaKeys?

> `optional` **metaKeys?**: readonly `string`[]

Defined in: [protocol/extension-mechanism.ts:628](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L628)

Channel 2 — reserved `_meta` keys the extension defines (R-24.5-d).

***

### resultTypes?

> `optional` **resultTypes?**: readonly `string`[]

Defined in: [protocol/extension-mechanism.ts:630](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L630)

Channel 3 — additional `resultType` discriminator values (R-24.5-e).

***

### fields?

> `optional` **fields?**: readonly `string`[]

Defined in: [protocol/extension-mechanism.ts:633](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L633)

Channel 4 — additional fields the extension adds to existing objects (R-24.5-g).
Listed as `"<ObjectName>.<fieldName>"` for documentation/conformance.
