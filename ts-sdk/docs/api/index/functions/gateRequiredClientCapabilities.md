[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / gateRequiredClientCapabilities

# Function: gateRequiredClientCapabilities()

> **gateRequiredClientCapabilities**(`declared`, `required`): [`CapabilityGateResult`](../type-aliases/CapabilityGateResult.md)

Defined in: [protocol/capability-negotiation.ts:332](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L332)

Gates a request against the capabilities it requires. (§6.4, R-6.4-h)

When every required capability is declared, returns `{ ok: true }`. Otherwise
returns `{ ok: false, error }` where `error` is the `-32003`
`MissingRequiredClientCapability` error whose `data.requiredCapabilities`
lists exactly the required-but-undeclared capabilities; on HTTP this rides a
`400 Bad Request` (see [httpStatusForCapabilityError](httpStatusForCapabilityError.md)).

## Parameters

### declared

`Record`\<`string`, `unknown`\>

The `ClientCapabilities` from the current request's `_meta`.

### required

`Record`\<`string`, `unknown`\>

The capabilities the server needs to process the request.

## Returns

[`CapabilityGateResult`](../type-aliases/CapabilityGateResult.md)
