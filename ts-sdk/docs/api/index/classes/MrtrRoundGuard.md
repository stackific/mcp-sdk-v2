[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MrtrRoundGuard

# Class: MrtrRoundGuard

Defined in: [protocol/multi-round-trip.ts:765](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L765)

A bounded round counter a client can use to guard against an unbounded MRTR
loop — there is no protocol-imposed round limit, so implementations SHOULD cap
it. (§11.5 line 2507, R-11.5-b)

## Constructors

### Constructor

> **new MrtrRoundGuard**(`maxRounds?`): `MrtrRoundGuard`

Defined in: [protocol/multi-round-trip.ts:767](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L767)

#### Parameters

##### maxRounds?

`number` = `16`

#### Returns

`MrtrRoundGuard`

## Properties

### maxRounds

> `readonly` **maxRounds**: `number` = `16`

Defined in: [protocol/multi-round-trip.ts:767](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L767)

## Accessors

### round

#### Get Signature

> **get** **round**(): `number`

Defined in: [protocol/multi-round-trip.ts:770](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L770)

The number of rounds recorded so far.

##### Returns

`number`

## Methods

### recordRound()

> **recordRound**(): `object`

Defined in: [protocol/multi-round-trip.ts:775](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L775)

Records one round; `ok` is `false` once `maxRounds` is exceeded.

#### Returns

`object`

##### ok

> **ok**: `boolean`

##### round

> **round**: `number`
