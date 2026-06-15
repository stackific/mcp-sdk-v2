[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / serveStdio

# Function: serveStdio()

> **serveStdio**(`server`, `transport`): [`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

Defined in: server/stdio.ts:33

Wires `server` to `transport` and starts dispatching. Returns an unsubscribe
function that stops handling inbound messages.

## Parameters

### server

[`McpServer`](../classes/McpServer.md)

### transport

[`Transport`](../../index/interfaces/Transport.md)

## Returns

[`Unsubscribe`](../../index/type-aliases/Unsubscribe.md)

## Example

```ts
import { StdioServerTransport } from '@stackific/mcp-sdk-ts';
serveStdio(server, new StdioServerTransport(process.stdin, process.stdout));
```
