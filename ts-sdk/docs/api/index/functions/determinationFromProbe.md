[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / determinationFromProbe

# Function: determinationFromProbe()

> **determinationFromProbe**(`outcome`): [`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md)

Defined in: [protocol/negotiation.ts:353](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L353)

Derives a [ProtocolSupportDetermination](../type-aliases/ProtocolSupportDetermination.md) from a probe outcome, ready to
cache. Both `'supported'` and `'unsupported-version'` mean the server speaks
this protocol family (the latter just not the requested revision);
`'not-this-protocol'` means it does not. (R-5.7, R-5.7-c)

## Parameters

### outcome

[`ProbeOutcome`](../type-aliases/ProbeOutcome.md)

## Returns

[`ProtocolSupportDetermination`](../type-aliases/ProtocolSupportDetermination.md)
