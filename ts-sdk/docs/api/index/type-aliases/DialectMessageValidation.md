[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DialectMessageValidation

# Type Alias: DialectMessageValidation

> **DialectMessageValidation** = \{ `ok`: `true`; `kind`: [`UiDialectKind`](UiDialectKind.md) \| `"response"`; `entry?`: [`UiDialectRegistryEntry`](../interfaces/UiDialectRegistryEntry.md); \} \| \{ `ok`: `false`; `reason`: `"malformed-framing"` \| `"unknown-method"`; `detail`: `string`; \}

Defined in: [protocol/ui-host.ts:745](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L745)

The outcome of validating an incoming dialect message.

## Union Members

### Type Literal

\{ `ok`: `true`; `kind`: [`UiDialectKind`](UiDialectKind.md) \| `"response"`; `entry?`: [`UiDialectRegistryEntry`](../interfaces/UiDialectRegistryEntry.md); \}

#### ok

> **ok**: `true`

#### kind

> **kind**: [`UiDialectKind`](UiDialectKind.md) \| `"response"`

#### entry?

> `optional` **entry?**: [`UiDialectRegistryEntry`](../interfaces/UiDialectRegistryEntry.md)

The dialect registry entry when the message names a known dialect method.

***

### Type Literal

\{ `ok`: `false`; `reason`: `"malformed-framing"` \| `"unknown-method"`; `detail`: `string`; \}
