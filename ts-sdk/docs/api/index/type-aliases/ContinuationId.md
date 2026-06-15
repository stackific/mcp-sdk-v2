[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ContinuationId

# Type Alias: ContinuationId

> **ContinuationId** = `string` \| `number` \| `boolean` \| `null` \| `ReadonlyArray`\<`unknown`\> \| `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [protocol/stateless.ts:33](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/stateless.ts#L33)

An opaque value that references cross-request state by identity rather than
by connection or session. (§4.5 / R-4.5-b)

Servers mint these values and return them as ordinary result fields.
Clients MUST echo them back verbatim — never parsing, interpreting,
modifying, or constructing them. (R-4.5-c)

Concrete field names are defined per feature:
  §12 / S18  — `nextCursor` / `cursor` (pagination)
  §11 / S17  — `requestState` (multi-round-trip)
  §25 / S39  — task handle (long-running tasks)
