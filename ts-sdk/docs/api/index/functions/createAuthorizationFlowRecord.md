[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / createAuthorizationFlowRecord

# Function: createAuthorizationFlowRecord()

> **createAuthorizationFlowRecord**(`options`): [`AuthorizationFlowRecord`](../interfaces/AuthorizationFlowRecord.md)

Defined in: [protocol/authorization-flow.ts:659](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L659)

Builds the Step-1 per-request record: a fresh PKCE pair (unless supplied), an
opaque `state` (unless supplied), and the recorded `issuer`. (R-23.5-a,
R-23.5-b, R-23.5-c, R-23.5-g)

The record MUST be created and the `issuer` recorded BEFORE the user agent is
redirected, so the redirect's `iss` and `state` can be validated against it.

## Parameters

### options

[`CreateAuthorizationFlowRecordOptions`](../interfaces/CreateAuthorizationFlowRecordOptions.md)

The recorded issuer and OPTIONAL pre-built PKCE/state.

## Returns

[`AuthorizationFlowRecord`](../interfaces/AuthorizationFlowRecord.md)
