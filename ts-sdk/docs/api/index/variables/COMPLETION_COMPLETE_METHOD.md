[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / COMPLETION\_COMPLETE\_METHOD

# Variable: COMPLETION\_COMPLETE\_METHOD

> `const` **COMPLETION\_COMPLETE\_METHOD**: `"completion/complete"`

Defined in: [protocol/completion.ts:76](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L76)

The exact, case-sensitive method string for the single completion request,
sent client→server. (§19.2, R-19-a, R-19.2-a)

Mirrors the literal already mapped to the `completions` capability by the S10
`SERVER_METHOD_CAPABILITY` gate; [completionGatedByCompletions](../functions/completionGatedByCompletions.md) asserts
the two agree.
