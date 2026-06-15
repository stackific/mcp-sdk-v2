[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UNSUPPORTED\_PROTOCOL\_VERSION\_CODE

# Variable: UNSUPPORTED\_PROTOCOL\_VERSION\_CODE

> `const` **UNSUPPORTED\_PROTOCOL\_VERSION\_CODE**: `-32004`

Defined in: [protocol/discovery.ts:166](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L166)

The `UnsupportedProtocolVersion` JSON-RPC error code. (§5.5 / S09)

Defined here because discovery is the first method that MUST emit it
(R-5.3.1-g); S09 owns the full error definition and will reuse this constant.
This mirrors how `MISSING_CLIENT_CAPABILITY_CODE` is defined in S05's meta.ts
for the same forward-reference reason.
