[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateThirdPartyExtensionId

# Function: validateThirdPartyExtensionId()

> **validateThirdPartyExtensionId**(`identifier`): [`ThirdPartyIdValidation`](../type-aliases/ThirdPartyIdValidation.md)

Defined in: [protocol/extension-mechanism.ts:143](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L143)

Validates an extension identifier *as a third-party identifier*, returning the
specific reason on failure. (R-24.2-a, R-24.2-b, R-24.2-d, R-24.2-e, R-24.2-f)

A third-party identifier MUST: include a `/`-terminated vendor prefix; have
every prefix label and the name conform to the §24.2 grammar; and NOT use a
reserved prefix — neither one whose second label is `modelcontextprotocol`/`mcp`
(e.g. `io.modelcontextprotocol/x`, `com.mcp.tools/x`) nor the bare tokens
`modelcontextprotocol`/`mcp` used as a single-label prefix. `com.example.mcp/x`
is allowed (its second label is `example`).

Identifiers are compared octet-for-octet; case folding is never applied, so
`Com.Example/Ext` and `com.example/ext` are distinct. (R-24.2-g)

## Parameters

### identifier

`string`

## Returns

[`ThirdPartyIdValidation`](../type-aliases/ThirdPartyIdValidation.md)
