[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ServerRequestDisposition

# Type Alias: ServerRequestDisposition

> **ServerRequestDisposition** = \{ `ok`: `false`; `stage`: `"revision"`; `code`: *typeof* [`UNSUPPORTED_PROTOCOL_VERSION_CODE`](../variables/UNSUPPORTED_PROTOCOL_VERSION_CODE.md); `data`: \{ `supported`: `string`[]; `requested`: `unknown`; \}; \} \| \{ `ok`: `false`; `stage`: `"envelope"`; `code`: *typeof* [`INVALID_PARAMS_CODE`](../variables/INVALID_PARAMS_CODE.md); `message`: `string`; \} \| \{ `ok`: `false`; `stage`: `"capability"`; `code`: *typeof* [`MISSING_CLIENT_CAPABILITY_CODE`](../variables/MISSING_CLIENT_CAPABILITY_CODE.md); `data`: \{ `requiredCapabilities`: `Record`\<`string`, `unknown`\>; \}; \} \| \{ `ok`: `false`; `stage`: `"gating"`; `reason`: `"not-advertised"`; \} \| \{ `ok`: `true`; \}

Defined in: [protocol/conformance-requirements.ts:430](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L430)

The disposition a conformant server reaches for an incoming request after the
ordered §29.2 checks. Either a rejection carrying the registry-exact code, or
acceptance (the request proceeds to a resultType-tagged success). (§29.2)

## Union Members

### Type Literal

\{ `ok`: `false`; `stage`: `"revision"`; `code`: *typeof* [`UNSUPPORTED_PROTOCOL_VERSION_CODE`](../variables/UNSUPPORTED_PROTOCOL_VERSION_CODE.md); `data`: \{ `supported`: `string`[]; `requested`: `unknown`; \}; \}

§29.2 item 4 failed: unsupported declared revision. (R-29.2-h)

***

### Type Literal

\{ `ok`: `false`; `stage`: `"envelope"`; `code`: *typeof* [`INVALID_PARAMS_CODE`](../variables/INVALID_PARAMS_CODE.md); `message`: `string`; \}

§29.2 item 6 failed: a §4-required envelope field is missing/malformed. (R-29.2-j)

***

### Type Literal

\{ `ok`: `false`; `stage`: `"capability"`; `code`: *typeof* [`MISSING_CLIENT_CAPABILITY_CODE`](../variables/MISSING_CLIENT_CAPABILITY_CODE.md); `data`: \{ `requiredCapabilities`: `Record`\<`string`, `unknown`\>; \}; \}

§29.2 item 5 failed: a required client capability was not declared. (R-29.2-i, R-29.4-k)

***

### Type Literal

\{ `ok`: `false`; `stage`: `"gating"`; `reason`: `"not-advertised"`; \}

§29.2 item 8 failed: the feature is not gated by an advertised capability. (R-29.2-m, R-29.2-n)

***

### Type Literal

\{ `ok`: `true`; \}

All checks pass: the request is accepted and proceeds to a success result.
