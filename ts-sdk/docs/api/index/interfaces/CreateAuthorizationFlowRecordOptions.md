[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CreateAuthorizationFlowRecordOptions

# Interface: CreateAuthorizationFlowRecordOptions

Defined in: [protocol/authorization-flow.ts:623](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L623)

Inputs to [createAuthorizationFlowRecord](../functions/createAuthorizationFlowRecord.md).

## Properties

### recordedIssuer

> **recordedIssuer**: `string`

Defined in: [protocol/authorization-flow.ts:628](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L628)

The `issuer` of the selected authorization server's validated metadata, to be
recorded for later `iss` validation. (R-23.5-c)

***

### pkce?

> `optional` **pkce?**: [`PkceChallenge`](PkceChallenge.md)

Defined in: [protocol/authorization-flow.ts:630](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L630)

OPTIONAL pre-generated PKCE pair; one is generated when omitted.

***

### state?

> `optional` **state?**: `string`

Defined in: [protocol/authorization-flow.ts:632](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L632)

OPTIONAL `state`; one is generated when omitted (see [generateState](../functions/generateState.md)).

***

### randomSource?

> `optional` **randomSource?**: (`size`) => `Buffer`

Defined in: [protocol/authorization-flow.ts:634](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L634)

OPTIONAL byte source for PKCE generation; defaults to `node:crypto`.

#### Parameters

##### size

`number`

#### Returns

`Buffer`
