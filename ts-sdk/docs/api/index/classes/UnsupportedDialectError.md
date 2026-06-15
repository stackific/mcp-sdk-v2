[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UnsupportedDialectError

# Class: UnsupportedDialectError

Defined in: [protocol/tools.ts:301](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L301)

Error thrown / reported when a tool schema declares a dialect this
implementation does not support. The implementation MUST handle an unsupported
dialect gracefully by signalling an error rather than silently ignoring the
declaration or treating the schema as permissive. (§16.4(9), R-16.4-t)

## Extends

- `Error`

## Constructors

### Constructor

> **new UnsupportedDialectError**(`dialect`): `UnsupportedDialectError`

Defined in: [protocol/tools.ts:302](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L302)

#### Parameters

##### dialect

`string`

#### Returns

`UnsupportedDialectError`

#### Overrides

`Error.constructor`

## Properties

### dialect

> `readonly` **dialect**: `string`

Defined in: [protocol/tools.ts:302](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L302)
