[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionDispatchOutcome

# Type Alias: ExtensionDispatchOutcome\<Result\>

> **ExtensionDispatchOutcome**\<`Result`\> = \{ `ok`: `true`; `result`: `Result`; \} \| \{ `ok`: `false`; `reason`: [`ExtensionDispatchRejection`](ExtensionDispatchRejection.md); `code`: *typeof* [`INVALID_PARAMS_CODE`](../variables/INVALID_PARAMS_CODE.md); \}

Defined in: [protocol/extension-mechanism.ts:743](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L743)

Outcome of [ExtensionMethodRouter.dispatch](../classes/ExtensionMethodRouter.md#dispatch).

## Type Parameters

### Result

`Result` = `unknown`
