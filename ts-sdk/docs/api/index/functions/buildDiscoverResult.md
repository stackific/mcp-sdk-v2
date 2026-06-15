[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildDiscoverResult

# Function: buildDiscoverResult()

> **buildDiscoverResult**(`config`): `objectOutputType`

Defined in: [protocol/discovery.ts:248](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L248)

Builds a successful `DiscoverResult` from a server's `DiscoverConfig`. (§5.3.2)

`resultType` is set to `"complete"` (R-5.3.2-a). Optional `instructions` and
`_meta` are included only when supplied — they are never defaulted.

## Parameters

### config

[`DiscoverConfig`](../interfaces/DiscoverConfig.md)

## Returns

`objectOutputType`

## Throws

When `config.supportedVersions` is empty — a server MUST
  advertise at least one accepted revision (R-5.3.2-b).
