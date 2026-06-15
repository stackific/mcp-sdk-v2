[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CONFORMANCE\_REQUIREMENTS

# Variable: CONFORMANCE\_REQUIREMENTS

> `const` **CONFORMANCE\_REQUIREMENTS**: readonly [`ConformanceRequirement`](../interfaces/ConformanceRequirement.md)[]

Defined in: [protocol/conformance-requirements.ts:236](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L236)

The complete registry of §29/§30 normative requirements, in document order.
(§29.1–§29.9, §30) Each entry mirrors exactly one `[R-… · KEYWORD]` atom from
the story's §7; the keyword and level honor the spec verbatim. A conformance
suite iterates this to enumerate every applicable obligation for a profile
(see [requirementsForProfile](../functions/requirementsForProfile.md)).
