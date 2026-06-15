[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / pickKnownSettings

# Function: pickKnownSettings()

> **pickKnownSettings**(`settings`, `knownKeys`): `Record`\<`string`, `unknown`\>

Defined in: [protocol/extensions.ts:261](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L261)

Projects a settings object down to only the keys an extension defines,
ignoring (dropping) any keys the extension does not recognize. (R-6.5-k,
R-6.6-e)

This realizes "a receiver MUST ignore settings keys it does not recognize":
unknown keys are silently dropped, never treated as an error, so an extension
can add settings over time without breaking older receivers.

## Parameters

### settings

`Record`\<`string`, `unknown`\>

The raw settings object (may carry unknown keys).

### knownKeys

`Iterable`\<`string`\>

The settings keys this extension version defines.

## Returns

`Record`\<`string`, `unknown`\>
