[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / STATELESS\_MODEL

# Variable: STATELESS\_MODEL

> `const` **STATELESS\_MODEL**: `object`

Defined in: [protocol/stateless.ts:76](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/stateless.ts#L76)

Documentation constants for the normative stateless-processing rules that
every S06-conformant server must satisfy. Runtime enforcement lives in
`validateRequestMeta` (S05), which ensures each request carries a
self-describing `_meta`.

## Type Declaration

### NO\_PRIOR\_REQUEST\_INFERENCE

> `readonly` **NO\_PRIOR\_REQUEST\_INFERENCE**: `"R-4.4-a"` = `'R-4.4-a'`

Server MUST NOT infer state from earlier requests, even on same connection. (R-4.4-a)

### NO\_HANDSHAKE\_REQUIRED

> `readonly` **NO\_HANDSHAKE\_REQUIRED**: `"R-4.4-b"` = `'R-4.4-b'`

Server MUST NOT require any prior request before processing a given request. (R-4.4-b)

### IDENTITY\_FROM\_META\_ONLY

> `readonly` **IDENTITY\_FROM\_META\_ONLY**: `"R-4.4-c"` = `'R-4.4-c'`

Server MUST derive identity, capabilities, version solely from the current `_meta`. (R-4.4-c)

### NO\_PER\_CONNECTION\_STATE

> `readonly` **NO\_PER\_CONNECTION\_STATE**: `"R-4.4-d"` = `'R-4.4-d'`

Server MUST NOT depend on persisted per-connection conversational state. (R-4.4-d)

### CONNECTION\_NOT\_CONVERSATION

> `readonly` **CONNECTION\_NOT\_CONVERSATION**: `"R-4.4-f"` = `'R-4.4-f'`

Server MUST NOT treat connection/process identity as a proxy for conversation. (R-4.4-f)

### EXPLICIT\_CONTINUATION\_ONLY

> `readonly` **EXPLICIT\_CONTINUATION\_ONLY**: `"R-4.5-a"` = `'R-4.5-a'`

Cross-request state MUST be referenced by an explicit identifier, not connection. (R-4.5-a)

### LIST\_RESULTS\_CONNECTION\_INDEPENDENT

> `readonly` **LIST\_RESULTS\_CONNECTION\_INDEPENDENT**: `"R-4.6-a"` = `'R-4.6-a'`

List results MUST NOT vary based on connection identity. (R-4.6-a)
