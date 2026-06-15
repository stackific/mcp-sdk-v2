[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / STALE\_SCHEMA\_STRATEGY

# Variable: STALE\_SCHEMA\_STRATEGY

> `const` **STALE\_SCHEMA\_STRATEGY**: `object`

Defined in: [transport/http/param-headers.ts:344](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L344)

The client strategy for a missing or stale `inputSchema`. (§9.5.2)

  - With no/stale schema, the client SHOULD send the `tools/call` without
    custom `Mcp-Param-*` headers — [buildParamHeaders](../functions/buildParamHeaders.md) returns `{}` for
    an absent schema. (R-9.5.2-l)
  - If the server rejects because required custom headers are missing, the
    client SHOULD call `tools/list` for the current schema and retry. (R-9.5.2-m)
  - A client MAY pre-load tool definitions by other means to emit headers
    without a prior `tools/list`. (R-9.5.2-n)

## Type Declaration

### SEND\_WITHOUT\_HEADERS

> `readonly` **SEND\_WITHOUT\_HEADERS**: `"R-9.5.2-l"` = `'R-9.5.2-l'`

### RETRY\_AFTER\_TOOLS\_LIST

> `readonly` **RETRY\_AFTER\_TOOLS\_LIST**: `"R-9.5.2-m"` = `'R-9.5.2-m'`

### MAY\_PRELOAD

> `readonly` **MAY\_PRELOAD**: `"R-9.5.2-n"` = `'R-9.5.2-n'`
