[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CUSTOM\_TRANSPORT\_OBLIGATIONS

# Variable: CUSTOM\_TRANSPORT\_OBLIGATIONS

> `const` **CUSTOM\_TRANSPORT\_OBLIGATIONS**: `object`

Defined in: [transport/contract.ts:256](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L256)

The obligations on a custom transport. (§7.3)

A custom transport MAY exist (R-7.3-a) but MUST preserve the JSON-RPC message
format, the exchange patterns, and the per-request metadata model (R-7.3-b),
MUST uphold every §7.2 guarantee (R-7.3-c), SHOULD document its connection
establishment / framing / cancellation (R-7.3-d), and SHOULD reuse the stdio
newline framing when running over a reliable byte stream (R-7.3-e).

## Type Declaration

### MAY\_IMPLEMENT

> `readonly` **MAY\_IMPLEMENT**: `"R-7.3-a"` = `'R-7.3-a'`

### PRESERVE\_FORMAT\_PATTERNS\_METADATA

> `readonly` **PRESERVE\_FORMAT\_PATTERNS\_METADATA**: `"R-7.3-b"` = `'R-7.3-b'`

### UPHOLD\_ALL\_GUARANTEES

> `readonly` **UPHOLD\_ALL\_GUARANTEES**: `"R-7.3-c"` = `'R-7.3-c'`

### SHOULD\_DOCUMENT

> `readonly` **SHOULD\_DOCUMENT**: `"R-7.3-d"` = `'R-7.3-d'`

### SHOULD\_REUSE\_STDIO\_FRAMING

> `readonly` **SHOULD\_REUSE\_STDIO\_FRAMING**: `"R-7.3-e"` = `'R-7.3-e'`
