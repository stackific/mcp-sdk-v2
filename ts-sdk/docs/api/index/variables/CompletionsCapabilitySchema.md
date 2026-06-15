[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletionsCapabilitySchema

# Variable: CompletionsCapabilitySchema

> `const` **CompletionsCapabilitySchema**: `ZodRecord`\<`ZodString`, `ZodUnknown`\>

Defined in: [protocol/completion.ts:128](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L128)

The value of the `completions` key in a server's declared capabilities; its
PRESENCE (not its contents) declares support for argument autocompletion. It
is an OPEN object — the empty object `{}` is the minimum baseline and the
RECOMMENDED value. (§19.1, R-19.1-a, R-19.1-b)

`.passthrough()` keeps the object open to forward-compatible additions; the
shape mirrors the `completions` field already declared in
`ServerCapabilitiesSchema` (S10) — this schema lets a server build/validate the
capability value standalone.
