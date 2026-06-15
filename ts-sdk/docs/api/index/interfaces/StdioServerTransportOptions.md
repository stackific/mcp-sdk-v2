[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StdioServerTransportOptions

# Interface: StdioServerTransportOptions

Defined in: [transport/stdio.ts:332](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L332)

Options for [StdioServerTransport](../classes/StdioServerTransport.md).

## Properties

### stdin?

> `optional` **stdin?**: `Readable` \| `null`

Defined in: [transport/stdio.ts:334](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L334)

Byte source for client→server messages (defaults to `process.stdin`).

***

### stdout?

> `optional` **stdout?**: `Writable` \| `null`

Defined in: [transport/stdio.ts:336](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/stdio.ts#L336)

Byte sink for server→client messages (defaults to `process.stdout`).
