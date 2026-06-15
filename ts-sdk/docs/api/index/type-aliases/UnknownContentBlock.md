[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UnknownContentBlock

# Type Alias: UnknownContentBlock

> **UnknownContentBlock** = `object` & `Record`\<`string`, `unknown`\>

Defined in: [types/content.ts:172](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/content.ts#L172)

A `ContentBlock` with an unrecognized `type`; treated as unsupported content.

TypeScript does not support negated literal types, so `Exclude<string, 'tool_use' |
'tool_result'>` evaluates to `string` — the static type cannot statically exclude the
forbidden sampling discriminators. The runtime enforcement is in `ContentBlockSchema`
via `.refine()`; `isForbiddenContentBlockType` guards producer code. (R-14.8-a, R-14.8-b)

## Type Declaration

### type

> **type**: `string`
