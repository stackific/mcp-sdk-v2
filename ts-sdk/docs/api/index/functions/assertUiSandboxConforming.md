[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertUiSandboxConforming

# Function: assertUiSandboxConforming()

> **assertUiSandboxConforming**(`options`): [`UiSandboxValidation`](../type-aliases/UiSandboxValidation.md)

Defined in: [protocol/security.ts:1160](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1160)

Asserts a server-provided UI is rendered conformingly: it runs in an isolated
sandbox that denies DOM/cookies/storage/navigation, under a restrictive CSP, and
exposes no credentials/tokens/unrelated context. (§28.8, R-28.8-a, R-28.8-e,
R-28.8-f, R-28.8-g; AC-44.21, AC-44.22)

Reuses S42's [sandboxIsolationIsConforming](sandboxIsolationIsConforming.md) (the deny-everything isolation
model) and [uiExposureIsClean](uiExposureIsClean.md) (the allow-list exposure check). A missing
CSP, an incomplete sandbox, or a dirty exposure each fails.

## Parameters

### options

#### sandboxDeniedAccess

`Iterable`\<`string`\>

The categories the sandbox denies (S42). (R-28.8-a)

#### restrictiveCspApplied

`boolean`

Whether a restrictive content-security policy is applied. (R-28.8-a)

#### exposedToUi

`Record`\<`string`, `unknown`\>

The data the host hands to the UI, exposure-checked (S42). (R-28.8-e)

## Returns

[`UiSandboxValidation`](../type-aliases/UiSandboxValidation.md)
