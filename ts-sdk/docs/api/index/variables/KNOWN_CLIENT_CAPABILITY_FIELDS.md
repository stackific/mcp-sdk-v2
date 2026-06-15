[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / KNOWN\_CLIENT\_CAPABILITY\_FIELDS

# Variable: KNOWN\_CLIENT\_CAPABILITY\_FIELDS

> `const` **KNOWN\_CLIENT\_CAPABILITY\_FIELDS**: `ReadonlySet`\<`string`\>

Defined in: [protocol/extensions.ts:357](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L357)

The core (recognized) capability field names a receiver of this SDK revision
understands. Any field NOT in these sets is "unknown" and MUST be tolerated
and ignored — never rejected, never treated as an error. (R-6.6-a – R-6.6-c,
R-6.6-f)

These mirror the fields on `ClientCapabilitiesSchema` / `ServerCapabilitiesSchema`
(S10); they exist here so [unknownCapabilityFields](../functions/unknownCapabilityFields.md) can report which
fields a receiver would ignore without coupling to those schemas' internals.
