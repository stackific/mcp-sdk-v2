[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / HeaderMismatchCause

# Type Alias: HeaderMismatchCause

> **HeaderMismatchCause** = \{ `kind`: `"missing-required-header"`; `header`: `string`; \} \| \{ `kind`: `"value-mismatch"`; `header`: `string`; `headerValue`: `string`; `bodyValue`: `string`; \} \| \{ `kind`: `"invalid-param-characters"`; `header`: `string`; \}

Defined in: [transport/http/responses.ts:350](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L350)

Describes the four conditions that MUST produce `-32001`. (R-9.8-b/c/d)

## Union Members

### Type Literal

\{ `kind`: `"missing-required-header"`; `header`: `string`; \}

A REQUIRED standard header is missing. (R-9.8-b)

***

### Type Literal

\{ `kind`: `"value-mismatch"`; `header`: `string`; `headerValue`: `string`; `bodyValue`: `string`; \}

A header value disagrees with the corresponding body value. (R-9.8-c)

***

### Type Literal

\{ `kind`: `"invalid-param-characters"`; `header`: `string`; \}

An `Mcp-Param-*` header value contains invalid characters. (R-9.8-d)
