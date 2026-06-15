[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ErrorCodeClass

# Variable: ErrorCodeClass

> `const` **ErrorCodeClass**: `object`

Defined in: [protocol/errors.ts:82](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L82)

The three classes a JSON-RPC error code can fall into, per §22. The numeric
`code` is authoritative; this taxonomy lets a receiver reason about a code it
has never seen. (R-22.1-h, R-22.7-a, R-22.7-e)

## Type Declaration

### JSON\_RPC\_STANDARD

> `readonly` **JSON\_RPC\_STANDARD**: `"json-rpc-standard"` = `'json-rpc-standard'`

The five reserved JSON-RPC pre-defined codes (`-32700`, `-32600..-32603`).

### MCP\_PROTOCOL

> `readonly` **MCP\_PROTOCOL**: `"mcp-protocol"` = `'mcp-protocol'`

MCP protocol-specific codes (`-32003`, `-32004`) — normative `data`. (§22.3)

### SERVER\_DEFINED

> `readonly` **SERVER\_DEFINED**: `"server-defined"` = `'server-defined'`

The implementation-defined server-error range `-32000..-32099`. (§22.7)

### EXTENSION\_DEFINED

> `readonly` **EXTENSION\_DEFINED**: `"extension-defined"` = `'extension-defined'`

Any integer outside every reserved/server range — extension-defined. (§22.7)
