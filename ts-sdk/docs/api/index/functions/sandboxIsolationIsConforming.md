[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / sandboxIsolationIsConforming

# Function: sandboxIsolationIsConforming()

> **sandboxIsolationIsConforming**(`deniedAccess`): `boolean`

Defined in: [protocol/ui-host.ts:1155](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1155)

Returns `true` when a proposed sandbox configuration is conforming: it denies
EVERY category in [SANDBOX\_DENIED\_ACCESS](../variables/SANDBOX_DENIED_ACCESS.md), leaving the §26.5 dialect
channel as the only path between the UI and the host (R-26.7-c). (§26.7,
R-26.7-a, R-26.7-b, R-26.7-c; AC-42.12, AC-42.13)

## Parameters

### deniedAccess

`Iterable`\<`string`\>

The access categories the sandbox denies.

## Returns

`boolean`
