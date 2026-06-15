[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertConsentedDataExposure

# Function: assertConsentedDataExposure()

> **assertConsentedDataExposure**(`options`): [`DataExposureValidation`](../type-aliases/DataExposureValidation.md)

Defined in: [protocol/security.ts:709](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L709)

Asserts that user/resource data is exposed to a server (or onward) ONLY with the
user's consent. (§28.4, R-28.4-b, R-28.1-e, R-28.1-f; AC-44.3, AC-44.11)

Returns `ok: false` when the exposure carries user data without an explicit,
matching consent grant — the host MUST NOT transmit resource data without
consent. Wraps [evaluateConsent](evaluateConsent.md) with the `'resource-exposure'` operation,
so data-exposure consent rides the same gate as tool-invocation consent.

## Parameters

### options

#### scope

`string`

The scope summary of the data being exposed.

#### priorGrant?

[`ConsentGrant`](../interfaces/ConsentGrant.md)

Any prior data-exposure consent grant.

#### userApproved?

`boolean`

Whether the user freshly approved this exposure.

## Returns

[`DataExposureValidation`](../type-aliases/DataExposureValidation.md)
