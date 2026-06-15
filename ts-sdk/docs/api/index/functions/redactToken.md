[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / redactToken

# Function: redactToken()

> **redactToken**(): `string`

Defined in: [protocol/authorization-registration.ts:1143](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1143)

Returns a redacted placeholder for a token so diagnostics never carry the secret
itself, enforcing token confidentiality at log/forward sinks. (R-23.19-m,
R-23.19-n, R-23.19-o)

Access and refresh tokens MUST NOT be logged or forwarded; when a diagnostic must
reference "the token", use this redaction instead of the value. Returns a fixed
marker regardless of input, so the secret is never embedded.

## Returns

`string`
