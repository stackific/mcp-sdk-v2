[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / INPUT\_RESPONSE\_SCHEMA\_BY\_METHOD

# Variable: INPUT\_RESPONSE\_SCHEMA\_BY\_METHOD

> `const` **INPUT\_RESPONSE\_SCHEMA\_BY\_METHOD**: `Readonly`\<`Record`\<`string`, `z.ZodType`\<`unknown`\>\>\>

Defined in: [protocol/multi-round-trip.ts:410](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L410)

Map from input-request `method` to the expected `InputResponse` schema for
that kind. Used by `validateInputResponseKinds` to enforce kind-correlation.
(R-11.4-e, R-11.4-f)
