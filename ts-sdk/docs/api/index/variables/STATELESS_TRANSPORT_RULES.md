[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / STATELESS\_TRANSPORT\_RULES

# Variable: STATELESS\_TRANSPORT\_RULES

> `const` **STATELESS\_TRANSPORT\_RULES**: `object`

Defined in: [transport/contract.ts:289](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L289)

The statelessness rules a transport and the server above it MUST honor. (§7.6)

A single connection MUST NOT be required to carry conversational state
(R-7.6-d); a server MUST NOT infer state from prior requests (R-7.6-e) or rely
on the connection for capabilities/version/identity (R-7.6-f); it SHOULD NOT
require connection reuse (R-7.6-g); a client MAY interleave unrelated requests
(R-7.6-h); connection identity MUST NOT proxy for conversation (R-7.6-i); and
cross-request state MUST be referenced by an explicit client-supplied
identifier, not by connection (R-7.6-j; see S06 `ContinuationId`).

## Type Declaration

### NO\_CONNECTION\_SCOPED\_STATE

> `readonly` **NO\_CONNECTION\_SCOPED\_STATE**: `"R-7.6-d"` = `'R-7.6-d'`

### NO\_PRIOR\_REQUEST\_INFERENCE

> `readonly` **NO\_PRIOR\_REQUEST\_INFERENCE**: `"R-7.6-e"` = `'R-7.6-e'`

### CONTEXT\_FROM\_META\_ONLY

> `readonly` **CONTEXT\_FROM\_META\_ONLY**: `"R-7.6-f"` = `'R-7.6-f'`

### SHOULD\_NOT\_REQUIRE\_CONNECTION\_REUSE

> `readonly` **SHOULD\_NOT\_REQUIRE\_CONNECTION\_REUSE**: `"R-7.6-g"` = `'R-7.6-g'`

### MAY\_INTERLEAVE\_UNRELATED

> `readonly` **MAY\_INTERLEAVE\_UNRELATED**: `"R-7.6-h"` = `'R-7.6-h'`

### CONNECTION\_NOT\_CONVERSATION

> `readonly` **CONNECTION\_NOT\_CONVERSATION**: `"R-7.6-i"` = `'R-7.6-i'`

### EXPLICIT\_CONTINUATION\_IDENTIFIER

> `readonly` **EXPLICIT\_CONTINUATION\_IDENTIFIER**: `"R-7.6-j"` = `'R-7.6-j'`
