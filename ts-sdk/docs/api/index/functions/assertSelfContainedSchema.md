[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / assertSelfContainedSchema

# Function: assertSelfContainedSchema()

> **assertSelfContainedSchema**(`schema`, `options?`): [`SchemaSelfContainmentValidation`](../type-aliases/SchemaSelfContainmentValidation.md)

Defined in: [protocol/security.ts:1540](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1540)

Asserts a tool schema is self-contained — it carries no external `$ref` that the
server would have to dereference — unless external resolution is explicitly
permitted against a trusted source. (§28.10, R-28.10-m, R-28.10-n; AC-44.29)

Reuses S25's [hasExternalRef](hasExternalRef.md), a pure structural inspection that performs no
I/O, so it can never trigger the SSRF fetch it guards against. A server MUST NOT
automatically dereference external references; when `allowTrustedExternalRefs` is
not set (the default), any external `$ref`/`$dynamicRef` fails.

## Parameters

### schema

`unknown`

The tool schema to inspect. (R-28.10-m)

### options?

#### allowTrustedExternalRefs?

`boolean`

Opt-in: external refs are resolved only
  against explicitly trusted sources. (R-28.10-n) Defaults to `false`.

#### maxDepth?

`number`

Recursion bound for the inspection; defaults to the schema limit.

## Returns

[`SchemaSelfContainmentValidation`](../type-aliases/SchemaSelfContainmentValidation.md)
