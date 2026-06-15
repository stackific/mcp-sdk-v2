[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertRegistrableToolSchema

# Function: assertRegistrableToolSchema()

> **assertRegistrableToolSchema**(`schema`, `role`, `opts?`): `void`

Defined in: [protocol/tools.ts:390](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L390)

Asserts a tool schema is safe to register, throwing when it is not. A server
MUST reject — or refuse to register — any schema it cannot safely validate.
Throws [UnsupportedDialectError](../classes/UnsupportedDialectError.md) specifically for an unsupported dialect
(so callers can map it to the §16.4(9) "dialect not supported" error) and a
`TypeError` for every other rejection. (§16.4(7)(9), R-16.4-n, R-16.4-t)

## Parameters

### schema

`unknown`

### role

[`SchemaRole`](../type-aliases/SchemaRole.md)

### opts?

#### limits?

[`SchemaLimits`](../interfaces/SchemaLimits.md)

#### allowExternalRefs?

`boolean`

## Returns

`void`

## Throws

When the schema declares an unsupported dialect.

## Throws

When the schema is otherwise unsafe to validate/register.
