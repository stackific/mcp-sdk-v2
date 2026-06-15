[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UnsafeUrlReason

# Type Alias: UnsafeUrlReason

> **UnsafeUrlReason** = \{ `reason`: `"invalid-url"`; \} \| \{ `reason`: `"contains-sensitive-info"`; `detail`: `string`; \} \| \{ `reason`: `"pre-authenticated"`; `detail`: `string`; \} \| \{ `reason`: `"insecure-scheme"`; `detail`: `string`; \}

Defined in: [protocol/elicitation-form.ts:1213](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1213)

One reason an elicitation URL is unsafe, per the §20.7 server construction rules.

## Union Members

### Type Literal

\{ `reason`: `"invalid-url"`; \}

Not a valid absolute URL.

***

### Type Literal

\{ `reason`: `"contains-sensitive-info"`; `detail`: `string`; \}

Carries apparent end-user PII / credentials in the URL. (R-20.7-p)

***

### Type Literal

\{ `reason`: `"pre-authenticated"`; `detail`: `string`; \}

Appears pre-authenticated to a protected resource. (R-20.7-q)

***

### Type Literal

\{ `reason`: `"insecure-scheme"`; `detail`: `string`; \}

Uses a non-HTTPS scheme outside development. (R-20.7-s)
