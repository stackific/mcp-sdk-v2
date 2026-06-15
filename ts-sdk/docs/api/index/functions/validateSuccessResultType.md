[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateSuccessResultType

# Function: validateSuccessResultType()

> **validateSuccessResultType**(`result`, `activeExtensionSet?`, `extensionResultTypes?`): \{ `ok`: `true`; `resultType`: `string`; \} \| \{ `ok`: `false`; `reason`: `"not-advertised"` \| `"missing"`; `resultType?`: `string`; \}

Defined in: [protocol/conformance-requirements.ts:540](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L540)

Asserts that a successful result carries a [RESULT\_TYPE](../variables/RESULT_TYPE.md) discriminator
drawn from the core set plus the values of advertised extensions only.
(§29.2 items 7 & 8, R-29.2-k, R-29.2-l)

Returns `{ ok: false, reason }` when the discriminator is absent
(`'missing'`) or present but not in the accepted set (`'not-advertised'`).
Reuses [isResultTypeAccepted](isResultTypeAccepted.md) (S38) so the accepted set is exactly the
core values plus those contributed by extensions in `activeExtensionSet`.

## Parameters

### result

`Record`\<`string`, `unknown`\>

The success result object (raw).

### activeExtensionSet?

`Iterable`\<`string`\> = `[]`

The extensions active for this interaction.

### extensionResultTypes?

`ReadonlyMap`\<`string`, `Iterable`\<`string`, `any`, `any`\>\> = `...`

Map of extension id → the resultType values it contributes.

## Returns

\{ `ok`: `true`; `resultType`: `string`; \} \| \{ `ok`: `false`; `reason`: `"not-advertised"` \| `"missing"`; `resultType?`: `string`; \}
