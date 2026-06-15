[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / sameRequestRecord

# Function: sameRequestRecord()

> **sameRequestRecord**(`record`): [`RequestRecordValidation`](../type-aliases/RequestRecordValidation.md)

Defined in: [protocol/authorization-registration.ts:1105](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1105)

Asserts that the recorded issuer, PKCE code verifier, and `state` are all present
in the same per-request record, the §23.19 storage invariant. (R-23.19-j)

All three MUST be co-located so the redirect can be validated coherently; an
empty field means the record is incomplete and the flow MUST NOT proceed.

## Parameters

### record

`Partial`\<[`SecureAuthorizationRequestRecord`](../interfaces/SecureAuthorizationRequestRecord.md)\>

The per-request record under construction.

## Returns

[`RequestRecordValidation`](../type-aliases/RequestRecordValidation.md)
