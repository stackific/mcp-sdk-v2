[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SERVER\_DISCOVER\_IS\_OPTIONAL

# Variable: SERVER\_DISCOVER\_IS\_OPTIONAL

> `const` **SERVER\_DISCOVER\_IS\_OPTIONAL**: `true`

Defined in: [protocol/negotiation.ts:81](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L81)

Whether `server/discover` is required before a first substantive request.

It is OPTIONAL (R-5.4-a): a client MAY probe with `server/discover` first, or
MAY proceed directly by declaring a revision on its first request and handling
an `UnsupportedProtocolVersion` rejection. The selection logic here is driven
purely by a client preference list and a server set — and that server set can
come from a discovery result *or* from a rejection's `data.supported`, so
negotiation never depends on a prior discovery call.
