[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TransportCloseInfo

# Interface: TransportCloseInfo

Defined in: [transport/contract.ts:65](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L65)

Why a transport channel became unusable, surfaced to `onClose` handlers.

`clean: true` is an orderly shutdown each side had the opportunity to observe
(R-7.2-t). `clean: false` is an abrupt disconnection — the channel dropped
without an orderly close — which a transport MUST still make observable
(R-7.5-a, R-7.5-b).

## Properties

### clean

> **clean**: `boolean`

Defined in: [transport/contract.ts:67](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L67)

`true` for an orderly close; `false` for an abrupt disconnection.

***

### reason?

> `optional` **reason?**: `string`

Defined in: [transport/contract.ts:69](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L69)

Optional human-readable explanation.
