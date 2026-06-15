[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RevisionNegotiationResult

# Type Alias: RevisionNegotiationResult

> **RevisionNegotiationResult** = \{ `ok`: `true`; `selected`: `string`; \} \| \{ `ok`: `false`; `reason`: `"no-mutual-revision"`; `clientPreference`: `string`[]; `serverSupported`: `string`[]; \}

Defined in: [protocol/negotiation.ts:84](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L84)

Outcome of the revision-selection rule.
