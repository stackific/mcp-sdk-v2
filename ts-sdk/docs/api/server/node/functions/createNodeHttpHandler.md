[**@stackific/mcp-sdk-ts**](../../../README.md)

***

[@stackific/mcp-sdk-ts](../../../README.md) / [server/node](../README.md) / createNodeHttpHandler

# Function: createNodeHttpHandler()

> **createNodeHttpHandler**(`server`, `options?`): (`req`, `res`) => `void`

Defined in: server/node.ts:23

Builds a `node:http` request listener that serves `server` over Streamable HTTP.

## Parameters

### server

[`McpServer`](../../classes/McpServer.md)

### options?

[`McpRequestHandlerOptions`](../../interfaces/McpRequestHandlerOptions.md) = `{}`

## Returns

(`req`, `res`) => `void`

## Example

```ts
import { createServer } from 'node:http';
createServer(createNodeHttpHandler(server)).listen(7001);
```
