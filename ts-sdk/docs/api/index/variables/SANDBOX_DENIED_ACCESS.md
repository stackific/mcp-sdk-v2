[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SANDBOX\_DENIED\_ACCESS

# Variable: SANDBOX\_DENIED\_ACCESS

> `const` **SANDBOX\_DENIED\_ACCESS**: readonly `string`[]

Defined in: [protocol/ui-host.ts:1140](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1140)

The access categories a sandboxed UI MUST be denied: the embedding document's
DOM, cookies, storage, and navigation. The rendered content MUST NOT be able
to escape the sandbox to reach host or user state. (§26.7, R-26.7-a, R-26.7-b;
AC-42.12) A host renders the UI in an isolated browsing context that blocks
every one of these.
