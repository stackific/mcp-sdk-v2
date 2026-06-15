[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / McpRequestHandlerOptions

# Interface: McpRequestHandlerOptions

Defined in: server/streamable-http.ts:63

Options for [createMcpRequestHandler](../functions/createMcpRequestHandler.md).

## Properties

### path?

> `optional` **path?**: `string`

Defined in: server/streamable-http.ts:65

The MCP endpoint path (default `/mcp`). Requests to other paths get `404`.

***

### authGate?

> `optional` **authGate?**: [`AuthGate`](../type-aliases/AuthGate.md)

Defined in: server/streamable-http.ts:67

Optional bearer/auth gate for a protected resource.

***

### cors?

> `optional` **cors?**: `string` \| `null`

Defined in: server/streamable-http.ts:69

`Access-Control-Allow-Origin` value; default `*`. Pass `null` to omit CORS headers.

***

### allowedOrigins?

> `optional` **allowedOrigins?**: `Iterable`\<`string`, `any`, `any`\>

Defined in: server/streamable-http.ts:76

Accepted `Origin` values for DNS-rebinding defense (§9.11). When provided, a
request whose `Origin` header is present and not in this set is rejected with
`403`; a request with no `Origin` (non-browser) is always allowed. When omitted,
`Origin` is not enforced (back-compatible default).
