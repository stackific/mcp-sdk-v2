[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DEFERRED\_TO\_TRANSPORT

# Variable: DEFERRED\_TO\_TRANSPORT

> `const` **DEFERRED\_TO\_TRANSPORT**: `object`

Defined in: [protocol/stateless.ts:109](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/stateless.ts#L109)

Documentation constants for stateless-model behaviors that are RECOMMENDED
(SHOULD) at the transport layer and cannot be enforced by this library.

These identifiers track which spec references have been consciously deferred.
Implementations in S12 (HTTP transport) and S15 (SSE/streaming) SHOULD
satisfy each of these constraints using their transport-specific mechanisms.

**Why deferred?** The stateless per-request model deliberately separates
application-layer identity (carried in `_meta`) from transport-layer
connection management. R-4.4-h, R-4.4-i, and R-4.4-j describe
RECOMMENDED connection-management strategies; they require transport-level
state that is outside this library's scope.

## Type Declaration

### INTERLEAVED\_TASK\_STREAMS

> `readonly` **INTERLEAVED\_TASK\_STREAMS**: `"R-4.4-h"` = `'R-4.4-h'`

Transports SHOULD support interleaved task streams so that unrelated
requests on the same connection do not head-of-line block. (R-4.4-h)

Deferred to: S12 (HTTP transport), S15 (SSE/streaming).

### NO\_CONNECTION\_REUSE\_REQUIREMENT

> `readonly` **NO\_CONNECTION\_REUSE\_REQUIREMENT**: `"R-4.4-i"` = `'R-4.4-i'`

Transports SHOULD NOT require connection reuse between requests in the
same logical conversation. (R-4.4-i)

Deferred to: S12 (HTTP transport), S15 (SSE/streaming).

### MID\_TASK\_RESUME\_ON\_NEW\_CONNECTION

> `readonly` **MID\_TASK\_RESUME\_ON\_NEW\_CONNECTION**: `"R-4.4-j"` = `'R-4.4-j'`

Transports SHOULD support mid-task resume on a new connection by accepting
a continuation identifier from a prior connection's response. (R-4.4-j)

Deferred to: S12 (HTTP transport), S15 (SSE/streaming).
