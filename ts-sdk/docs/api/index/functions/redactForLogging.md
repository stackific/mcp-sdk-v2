[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / redactForLogging

# Function: redactForLogging()

> **redactForLogging**(`value`): `unknown`

Defined in: [protocol/security.ts:1252](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1252)

Returns a copy of an object intended for a log/trace/telemetry sink with
credential/token values redacted, so credentials and tokens are never logged and
data crossing the trust boundary is minimized. (§28.9, R-28.9-c, R-28.9-d,
R-28.9-e; AC-44.23, AC-44.17)

Walks the object recursively; any property whose key names a credential/token
(see SENSITIVE\_LOG\_KEYS) has its value replaced with
[REDACTED\_PLACEHOLDER](../variables/REDACTED_PLACEHOLDER.md), regardless of the value's type. The input is never
mutated. Use at every logging boundary so an accidental log of a request/metadata
object cannot leak a secret.

## Parameters

### value

`unknown`

The object (or value) about to be logged.

## Returns

`unknown`
