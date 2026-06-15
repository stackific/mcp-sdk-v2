[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionDefinitionViolation

# Interface: ExtensionDefinitionViolation

Defined in: [protocol/extension-mechanism.ts:637](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L637)

A single reason an [ExtensionDefinition](ExtensionDefinition.md) fails framework conformance.

## Properties

### channel

> **channel**: [`ExtensionSurfaceChannel`](../type-aliases/ExtensionSurfaceChannel.md) \| `"identifier"`

Defined in: [protocol/extension-mechanism.ts:639](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L639)

Which surface channel (or the identifier) the violation concerns.

***

### value

> **value**: `string`

Defined in: [protocol/extension-mechanism.ts:641](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L641)

The offending value (a method, key, resultType, field, or the identifier).

***

### message

> **message**: `string`

Defined in: [protocol/extension-mechanism.ts:643](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L643)

Human-readable description of why it violates the framework.
