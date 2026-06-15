[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isFeatureFullyConformant

# Function: isFeatureFullyConformant()

> **isFeatureFullyConformant**(`advertised`, `fullyImplemented`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"advertised-not-implemented"`; \}

Defined in: [protocol/conformance-requirements.ts:996](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L996)

Enforces "no partial feature conformance": an implementation either fully
satisfies the MUST-level behavior of an advertised feature or MUST NOT
advertise it. (§29.9 item 4, R-29.9-b; the §29.4 advertise-implies-implement
rule, R-29.4-a, R-29.4-j)

Returns `{ ok: false, reason: 'advertised-not-implemented' }` when a feature is
advertised but not fully implemented (the non-conformant intermediate state),
and `{ ok: true }` otherwise — including when an UNadvertised feature is not
implemented (perfectly conformant) and when an advertised feature IS fully
implemented.

## Parameters

### advertised

`boolean`

Whether the feature is advertised.

### fullyImplemented

`boolean`

Whether every MUST-level behavior of the feature is implemented.

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"advertised-not-implemented"`; \}
