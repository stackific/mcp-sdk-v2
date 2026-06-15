[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / stripIgnoredStatelessHeaders

# Function: stripIgnoredStatelessHeaders()

> **stripIgnoredStatelessHeaders**(`headers`): `Record`\<`string`, `string`\>

Defined in: [transport/http/responses.ts:471](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L471)

Strips any session-identifier and `Last-Event-ID` headers from a request,
realizing the rule that the server MUST ignore them — no session affinity, no
resumption. (R-9.9-d, R-9.9-g, R-9.6.2-h) The input is not mutated.

## Parameters

### headers

`Record`\<`string`, `string`\>

The incoming request headers.

## Returns

`Record`\<`string`, `string`\>

A copy with the ignored headers removed.
