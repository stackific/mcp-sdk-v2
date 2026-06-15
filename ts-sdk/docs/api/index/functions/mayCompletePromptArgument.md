[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayCompletePromptArgument

# Function: mayCompletePromptArgument()

> **mayCompletePromptArgument**(): `boolean`

Defined in: [protocol/prompts.ts:745](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L745)

Whether a client MAY request auto-completion suggestions for a prompt argument
value through the Completion utility (§19 / S29). Prompt argument values are
always completable, so this is unconditionally `true`. (R-18.7-a, AC-28.42)

The completion request/result wire shapes, the prompt-argument reference type,
and the `completions` capability gating are owned by S29 and are NOT defined
here — this is only the hook the story points to.

## Returns

`boolean`
