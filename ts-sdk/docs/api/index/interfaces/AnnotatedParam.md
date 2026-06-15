[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AnnotatedParam

# Interface: AnnotatedParam

Defined in: [transport/http/param-headers.ts:55](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L55)

One `x-mcp-header`-annotated parameter discovered in an `inputSchema`.

## Properties

### rawName

> **rawName**: `unknown`

Defined in: [transport/http/param-headers.ts:57](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L57)

The raw `x-mcp-header` value (the name portion).

***

### type

> **type**: `string` \| `undefined`

Defined in: [transport/http/param-headers.ts:59](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L59)

The annotated property's declared JSON `type`, if any.

***

### path

> **path**: `string`[]

Defined in: [transport/http/param-headers.ts:61](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L61)

The property path from the schema root (object nesting only).

***

### underArray

> **underArray**: `boolean`

Defined in: [transport/http/param-headers.ts:63](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L63)

`true` when the annotation sits under an array `items` subschema.
