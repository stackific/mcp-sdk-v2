[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateRoutingHeaders

# Function: validateRoutingHeaders()

> **validateRoutingHeaders**(`headers`, `body`): [`HttpValidation`](../type-aliases/HttpValidation.md)

Defined in: [transport/http/headers.ts:319](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L319)

Validates the `Mcp-Method` and `Mcp-Name` routing headers against the body.
(§9.4)

  - `Mcp-Method` REQUIRED on every POST and MUST equal the body `method`
    verbatim, case-sensitively. (R-9.4-a, R-9.4.1-a)
  - `Mcp-Name` REQUIRED on `tools/call`/`prompts/get` (= `params.name`) and
    `resources/read` (= `params.uri`), and MUST NOT appear on other methods.
    (R-9.4.2-a–e)
  - Any mismatch or missing required routing header → `400` + `-32001`.
    (R-9.4.3-a)

## Parameters

### headers

[`HttpHeaders`](../type-aliases/HttpHeaders.md)

### body

`unknown`

## Returns

[`HttpValidation`](../type-aliases/HttpValidation.md)
