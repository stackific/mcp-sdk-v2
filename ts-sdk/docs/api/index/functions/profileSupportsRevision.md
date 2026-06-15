[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / profileSupportsRevision

# Function: profileSupportsRevision()

> **profileSupportsRevision**(`profile`, `revision`): `boolean`

Defined in: [protocol/conformance-requirements.ts:915](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L915)

Returns `true` when `revision` is supported as a profile revision: it is the
current wire value, or any revision the profile advertises. (§29.9 item 3)
Reuses [isSupportedProtocolVersion](isSupportedProtocolVersion.md) for the baseline wire value.

## Parameters

### profile

[`ConformanceProfile`](../interfaces/ConformanceProfile.md)

### revision

`string`

## Returns

`boolean`
