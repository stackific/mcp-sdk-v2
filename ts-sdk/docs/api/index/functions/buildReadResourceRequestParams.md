[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildReadResourceRequestParams

# Function: buildReadResourceRequestParams()

> **buildReadResourceRequestParams**(`uri`, `opts?`): `objectOutputType`

Defined in: [protocol/resources-read.ts:242](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L242)

Builds a `resources/read` request-params object. Includes the OPTIONAL retry
fields only when supplied, so a first-attempt read carries just `uri`.
(§17.5, R-17.5-a, R-17.5-b, R-17.5-d, R-17.5-f)

## Parameters

### uri

`string`

The resource to read (REQUIRED).

### opts?

OPTIONAL `inputResponses` / `requestState` (retry) and `_meta`.

#### inputResponses?

`Record`\<`string`, `unknown`\>

#### requestState?

`string`

#### _meta?

`Record`\<`string`, `unknown`\>

## Returns

`objectOutputType`

## Throws

When `uri` is not a valid RFC3986 resource URI. (R-17.5-b)
