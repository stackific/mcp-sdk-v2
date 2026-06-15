[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CLIENT\_MODIFIABLE\_REQUEST\_FIELDS

# Variable: CLIENT\_MODIFIABLE\_REQUEST\_FIELDS

> `const` **CLIENT\_MODIFIABLE\_REQUEST\_FIELDS**: readonly \[`"systemPrompt"`, `"includeContext"`, `"temperature"`, `"stopSequences"`, `"metadata"`\]

Defined in: [protocol/sampling.ts:823](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L823)

Fields a client (or host) MAY modify or omit as part of its human-in-the-loop
control over a sampling request, without communicating the change to the
server. (R-21.2.10-e)
