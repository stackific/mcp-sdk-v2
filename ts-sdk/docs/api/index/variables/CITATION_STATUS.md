[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CITATION\_STATUS

# Variable: CITATION\_STATUS

> `const` **CITATION\_STATUS**: `object`

Defined in: [protocol/conformance-requirements.ts:1014](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L1014)

The status the §30 citation markers carry: provenance only, never
load-bearing. (§30, R-30-a) No normative behavior, code, name, or wire format
depends on the content of any citation; stripping or altering a marker changes
nothing observable.

## Type Declaration

### loadBearing

> `readonly` **loadBearing**: `false` = `false`

Citations identify external sources; they are never load-bearing. (R-30-a)

### selfContained

> `readonly` **selfContained**: `true` = `true`

All normative content is fully specified in the document body. (R-30-a)
