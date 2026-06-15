[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / bearerAuthGate

# Function: bearerAuthGate()

> **bearerAuthGate**(`options`): [`AuthGate`](../type-aliases/AuthGate.md)

Defined in: server/auth.ts:92

Builds an [AuthGate](../type-aliases/AuthGate.md) that requires a valid `Bearer` token. On a missing /
invalid / wrong-audience token it returns `401` with a `WWW-Authenticate: Bearer …`
challenge (carrying `resource_metadata` when provided); on a missing required scope
it returns the `403 insufficient_scope` step-up challenge. (§23.1, §23.6, §23.18)

## Parameters

### options

[`BearerAuthGateOptions`](../interfaces/BearerAuthGateOptions.md)

## Returns

[`AuthGate`](../type-aliases/AuthGate.md)
