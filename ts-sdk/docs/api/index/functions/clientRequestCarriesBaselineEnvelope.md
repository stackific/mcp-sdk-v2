[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientRequestCarriesBaselineEnvelope

# Function: clientRequestCarriesBaselineEnvelope()

> **clientRequestCarriesBaselineEnvelope**(`meta`): `boolean`

Defined in: [protocol/conformance-requirements.ts:567](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L567)

Validates that a client request's metadata carries the three §4-required
fields — protocol revision, client identity, and client capabilities — that
baseline client conformance mandates on EVERY request. (§29.3 item 1, R-29.3-a)

A thin, intention-revealing wrapper over [validateRequestMeta](validateRequestMeta.md) so the
client-side baseline check and the server-side envelope check share one
required-field definition (the stateless model forbids relying on a remembered
earlier request).

## Parameters

### meta

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
