[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / HttpResponse

# Interface: HttpResponse

Defined in: [transport/http/responses.ts:126](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L126)

A fully-formed HTTP response: status, headers, and an optional JSON body.

## Properties

### status

> **status**: `number`

Defined in: [transport/http/responses.ts:128](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L128)

The HTTP status code.

***

### headers

> **headers**: `Record`\<`string`, `string`\>

Defined in: [transport/http/responses.ts:130](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L130)

Response headers (field names as written; compared case-insensitively elsewhere).

***

### body?

> `optional` **body?**: `unknown`

Defined in: [transport/http/responses.ts:132](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L132)

The JSON body, when present; absent for empty-body responses (e.g. `202`, `405`).
