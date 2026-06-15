[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / StreamableHTTPClientTransportOptions

# Interface: StreamableHTTPClientTransportOptions

Defined in: client/streamable-http.ts:61

Options for [StreamableHTTPClientTransport](../classes/StreamableHTTPClientTransport.md).

## Properties

### protocolVersion?

> `optional` **protocolVersion?**: `string`

Defined in: client/streamable-http.ts:68

Protocol revision used for the `MCP-Protocol-Version` header when a message
body carries no `_meta` protocol version (e.g. notifications and responses).
Requests always take their header version from the body so header and body
agree (§9.3.3). Defaults to [CURRENT\_PROTOCOL\_VERSION](../../index/variables/CURRENT_PROTOCOL_VERSION.md).

***

### authProvider?

> `optional` **authProvider?**: [`AuthProvider`](AuthProvider.md)

Defined in: client/streamable-http.ts:70

Optional bearer-token provider for a protected MCP endpoint.

***

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: client/streamable-http.ts:72

Extra static headers merged into every POST (e.g. a tracing header).

***

### fetch?

> `optional` **fetch?**: (`input`, `init?`) => `Promise`\<`Response`\>

Defined in: client/streamable-http.ts:74

Override the `fetch` implementation (injection point for tests/non-global runtimes).

#### Parameters

##### input

`string` \| `URL` \| `Request`

##### init?

`RequestInit`

#### Returns

`Promise`\<`Response`\>
