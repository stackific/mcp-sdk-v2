[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ErrorCodeRegistryEntry

# Interface: ErrorCodeRegistryEntry

Defined in: [protocol/errors.ts:123](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L123)

One row of the §22 error-code registry. (§6.5)

## Properties

### code

> `readonly` **code**: `number`

Defined in: [protocol/errors.ts:125](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L125)

The authoritative numeric code. (R-22.1-h)

***

### name

> `readonly` **name**: `string`

Defined in: [protocol/errors.ts:127](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L127)

The canonical condition name (case-sensitive, exactly as in §22). (R-22-a)

***

### class

> `readonly` **class**: [`ErrorCodeClass`](../type-aliases/ErrorCodeClass.md)

Defined in: [protocol/errors.ts:129](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L129)

Which classification range this code belongs to.

***

### meaning

> `readonly` **meaning**: `string`

Defined in: [protocol/errors.ts:131](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L131)

One-line meaning of the condition the code signals.

***

### dataPolicy

> `readonly` **dataPolicy**: [`ErrorDataPolicy`](../type-aliases/ErrorDataPolicy.md)

Defined in: [protocol/errors.ts:133](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L133)

Whether `error.data` is spec-normative or sender-defined. (R-22.1-k, R-22.3-a)

***

### dataKeys?

> `readonly` `optional` **dataKeys?**: readonly `string`[]

Defined in: [protocol/errors.ts:135](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L135)

The keys a normative `data` payload MUST carry, if any. (R-22.3-a)

***

### httpStatus?

> `readonly` `optional` **httpStatus?**: `number`

Defined in: [protocol/errors.ts:137](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L137)

The HTTP status this code maps to on the Streamable HTTP transport. (§22.6)
