[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProbeOutcome

# Type Alias: ProbeOutcome

> **ProbeOutcome** = \{ `kind`: `"supported"`; `supportedVersions`: `string`[]; `result`: [`DiscoverResult`](DiscoverResult.md); \} \| \{ `kind`: `"unsupported-version"`; `supported`: `string`[]; `requested`: `string`; \} \| \{ `kind`: `"not-this-protocol"`; `reason`: `string`; \}

Defined in: [protocol/negotiation.ts:202](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L202)

Outcome of interpreting a probe (`server/discover`) response. (§5.7)

## Union Members

### Type Literal

\{ `kind`: `"supported"`; `supportedVersions`: `string`[]; `result`: [`DiscoverResult`](DiscoverResult.md); \}

A valid `DiscoverResult`: the server speaks this protocol family.

***

### Type Literal

\{ `kind`: `"unsupported-version"`; `supported`: `string`[]; `requested`: `string`; \}

A recognized `-32004`: speaks the family, not the requested revision.

***

### Type Literal

\{ `kind`: `"not-this-protocol"`; `reason`: `string`; \}

Anything else: the server does not speak this protocol revision.
