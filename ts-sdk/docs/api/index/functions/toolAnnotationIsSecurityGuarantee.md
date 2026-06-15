[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / toolAnnotationIsSecurityGuarantee

# Function: toolAnnotationIsSecurityGuarantee()

> **toolAnnotationIsSecurityGuarantee**(`_annotations?`): `false`

Defined in: [protocol/security.ts:473](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L473)

Returns `false` — a tool annotation is NEVER a security guarantee. (§28.3,
R-28.3-c; AC-44.6)

A receiver MUST NOT rely on an annotation (e.g. a read-only or non-destructive
hint) as a security guarantee; such metadata is descriptive, not authoritative,
and a malicious server may misstate it. This is unconditional and delegates the
trust gate to S25's [mayTrustToolAnnotations](mayTrustToolAnnotations.md): even when annotations MAY
be *displayed* (trusted server), they still convey no enforcement authority.

## Parameters

### \_annotations?

`objectOutputType`\<\{ `title`: `ZodOptional`\<`ZodString`\>; `readOnlyHint`: `ZodOptional`\<`ZodBoolean`\>; `destructiveHint`: `ZodOptional`\<`ZodBoolean`\>; `idempotentHint`: `ZodOptional`\<`ZodBoolean`\>; `openWorldHint`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>

The tool annotations (ignored; the rule is unconditional).

## Returns

`false`
