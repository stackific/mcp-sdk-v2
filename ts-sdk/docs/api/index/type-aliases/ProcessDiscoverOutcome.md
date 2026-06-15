[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProcessDiscoverOutcome

# Type Alias: ProcessDiscoverOutcome

> **ProcessDiscoverOutcome** = \{ `ok`: `true`; `result`: [`DiscoverResult`](DiscoverResult.md); \} \| \{ `ok`: `false`; `error`: \{ `code`: *typeof* [`INVALID_PARAMS_CODE`](../variables/INVALID_PARAMS_CODE.md); `message`: `string`; \} \| [`UnsupportedProtocolVersionError`](../interfaces/UnsupportedProtocolVersionError.md); \}

Defined in: [protocol/discovery.ts:326](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L326)

Outcome of [processDiscoverRequest](../functions/processDiscoverRequest.md).
