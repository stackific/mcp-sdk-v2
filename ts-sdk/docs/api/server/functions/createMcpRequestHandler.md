[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / createMcpRequestHandler

# Function: createMcpRequestHandler()

> **createMcpRequestHandler**(`server`, `options?`): (`request`) => `Promise`\<`Response`\>

Defined in: server/streamable-http.ts:89

Builds a Web `fetch` handler that serves `server` over Streamable HTTP.

## Parameters

### server

[`McpServer`](../classes/McpServer.md)

### options?

[`McpRequestHandlerOptions`](../interfaces/McpRequestHandlerOptions.md) = `{}`

## Returns

(`request`) => `Promise`\<`Response`\>

## Example

```ts
// Cloudflare Workers
const handle = createMcpRequestHandler(server);
export default { fetch: (req: Request) => handle(req) };
```
