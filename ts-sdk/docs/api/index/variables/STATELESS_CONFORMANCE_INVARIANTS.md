[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / STATELESS\_CONFORMANCE\_INVARIANTS

# Variable: STATELESS\_CONFORMANCE\_INVARIANTS

> `const` **STATELESS\_CONFORMANCE\_INVARIANTS**: `object`

Defined in: [protocol/conformance-requirements.ts:738](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L738)

The stateless-model invariants that bind every role. (§29.7, R-29.7-a – R-29.7-e)
A flat, enumerable restatement a conformance harness can assert against.

## Type Declaration

### independentRequests

> `readonly` **independentRequests**: `true` = `true`

Each request is processed independently; no context inferred from an earlier one. (R-29.7-a)

### explicitCrossRequestState

> `readonly` **explicitCrossRequestState**: `true` = `true`

Cross-request state rides an explicit client-supplied identifier/opaque value. (R-29.7-b)

### connectionIsNotLifetimeBoundary

> `readonly` **connectionIsNotLifetimeBoundary**: `true` = `true`

The connection/process is NOT the lifetime boundary of a conversation/task/subscription. (R-29.7-c)

### requestStateIsUntrusted

> `readonly` **requestStateIsUntrusted**: `true` = `true`

A requestState passing through a client is attacker-controlled input. (R-29.7-d)

### requestStateIntegrityProtected

> `readonly` **requestStateIntegrityProtected**: `true` = `true`

A security-significant requestState is integrity-protected; failed verification is rejected. (R-29.7-e)
