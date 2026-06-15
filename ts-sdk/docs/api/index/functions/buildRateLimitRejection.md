[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildRateLimitRejection

# Function: buildRateLimitRejection()

> **buildRateLimitRejection**(`retryAfterMs?`, `message?`): [`RateLimitRejectionError`](../interfaces/RateLimitRejectionError.md)

Defined in: [protocol/security.ts:604](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L604)

Builds the `-32600` rate-limit rejection error a server returns for a `tools/call`
that exceeds the limit, matching the §28.3 wire example. (§28.3, R-28.3-h;
AC-44.9)

## Parameters

### retryAfterMs?

`number`

OPTIONAL hint for when the client may retry.

### message?

`string`

OPTIONAL override for the error message.

## Returns

[`RateLimitRejectionError`](../interfaces/RateLimitRejectionError.md)
