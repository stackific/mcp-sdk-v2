[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateParamHeaders

# Function: validateParamHeaders()

> **validateParamHeaders**(`inputSchema`, `args`, `headers`): [`HttpValidation`](../type-aliases/HttpValidation.md)

Defined in: [transport/http/param-headers.ts:281](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L281)

Validates the `Mcp-Param-*` headers of a request against its body. (§9.5.4)

  - A recognized header with impermissible characters → `400` + `-32001`.
    (R-9.5.4-b)
  - A header whose decoded value does not match the body value → `400` +
    `-32001`; integers are compared numerically. (R-9.5.4-c, R-9.5.4-d)
  - A body value present while its header is omitted → `400` + `-32001`.
    (R-9.5.2-k)
  - A header present while the body value is absent/null → `400` + `-32001`.

## Parameters

### inputSchema

`unknown`

The tool's `inputSchema` (source of annotations).

### args

`Record`\<`string`, `unknown`\>

The body `params.arguments`.

### headers

[`HttpHeaders`](../type-aliases/HttpHeaders.md)

The request headers.

## Returns

[`HttpValidation`](../type-aliases/HttpValidation.md)
