[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decideResultAction

# Function: decideResultAction()

> **decideResultAction**(`result`, `activeExtensionSet?`, `extensionResultTypes?`): \{ `act`: `true`; `resultType`: `string`; \} \| \{ `act`: `false`; `reason`: `"unrecognized"`; `resultType`: `string`; \}

Defined in: [protocol/conformance-requirements.ts:714](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L714)

Applies the §29.6 + §3 receiver rules to a result's `resultType`. (R-29.6-f,
R-29.6-g, R-29.6-h) Returns:
  - `{ act: true, resultType }`   — recognized (core or, when supplied, an
    accepted extension value): the receiver MAY act on the result;
  - `{ act: false, reason: 'unrecognized', resultType }` — present but not
    accepted: treat the whole response as an error, do not act (R-29.6-f/g);

An ABSENT discriminator is resolved by the §3 absence rule via
[interpretResultType](interpretResultType.md) (treated as `"complete"`, recognized) so the
receiver acts on it (R-29.6-h).

## Parameters

### result

`Record`\<`string`, `unknown`\>

### activeExtensionSet?

`Iterable`\<`string`\> = `[]`

### extensionResultTypes?

`ReadonlyMap`\<`string`, `Iterable`\<`string`, `any`, `any`\>\> = `...`

## Returns

\{ `act`: `true`; `resultType`: `string`; \} \| \{ `act`: `false`; `reason`: `"unrecognized"`; `resultType`: `string`; \}
