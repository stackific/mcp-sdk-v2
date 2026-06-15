[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateToolUiMetaValue

# Function: validateToolUiMetaValue()

> **validateToolUiMetaValue**(`value`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"not-an-object"` \| `"missing-resourceUri"` \| `"resourceUri-not-ui-uri"`; \}

Defined in: [protocol/registries.ts:620](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L620)

Validates a `Tool` object's `_meta.ui` value against Appendix C: it MUST be an
object with a REQUIRED `resourceUri` that is a `ui://` URI and an OPTIONAL
`visibility`; absence of `resourceUri` (or a non-`ui://` value) is
non-conformant. The key is meaningful only when the UI extension is active.
(R-AppC-i, AC-46.11)

## Parameters

### value

`unknown`

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"not-an-object"` \| `"missing-resourceUri"` \| `"resourceUri-not-ui-uri"`; \}
