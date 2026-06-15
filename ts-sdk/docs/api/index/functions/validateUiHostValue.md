[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateUiHostValue

# Function: validateUiHostValue()

> **validateUiHostValue**(`value`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"not-an-object"` \| `"missing-mimeTypes"` \| `"mimeTypes-not-array"` \| `"missing-required-mime-type"`; \}

Defined in: [protocol/registries.ts:594](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L594)

Validates the `io.modelcontextprotocol/ui` host value against Appendix C/D: it
MUST carry a `mimeTypes` array (REQUIRED) that includes
[UI\_HOST\_REQUIRED\_MIME\_TYPE](../variables/UI_HOST_REQUIRED_MIME_TYPE.md); absence of `mimeTypes` is non-conformant.
(R-AppC-h, R-AppD-f, AC-46.10, AC-46.18)

A server *acknowledgement* value (as opposed to the host value) MAY be empty;
that case is the caller's to distinguish — this validator checks the host
value, where `mimeTypes` is required.

## Parameters

### value

`unknown`

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"not-an-object"` \| `"missing-mimeTypes"` \| `"mimeTypes-not-array"` \| `"missing-required-mime-type"`; \}
