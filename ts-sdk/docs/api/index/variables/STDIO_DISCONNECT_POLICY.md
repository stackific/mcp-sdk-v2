[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / STDIO\_DISCONNECT\_POLICY

# Variable: STDIO\_DISCONNECT\_POLICY

> `const` **STDIO\_DISCONNECT\_POLICY**: `object`

Defined in: [transport/contract.ts:273](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L273)

Stdio-specific disconnection policy, owned by S13 (§8) and referenced by §7.5.

These are RECOMMENDED/OPTIONAL behaviors that require the stdio process
lifecycle and so are realized by the stdio transport, not by this contract
module: if the server subprocess exits unexpectedly the client SHOULD restart
it (R-7.5-g), and in-flight requests lost on that exit MAY be retried against
the fresh process (R-7.5-h).

## Type Declaration

### SHOULD\_RESTART\_ON\_UNEXPECTED\_EXIT

> `readonly` **SHOULD\_RESTART\_ON\_UNEXPECTED\_EXIT**: `"R-7.5-g"` = `'R-7.5-g'`

### MAY\_RETRY\_INFLIGHT\_ON\_FRESH\_PROCESS

> `readonly` **MAY\_RETRY\_INFLIGHT\_ON\_FRESH\_PROCESS**: `"R-7.5-h"` = `'R-7.5-h'`
