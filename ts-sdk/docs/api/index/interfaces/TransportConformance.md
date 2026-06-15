[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TransportConformance

# Interface: TransportConformance

Defined in: [protocol/conformance-requirements.ts:789](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L789)

The conformance evaluation of a SINGLE transport an implementation offers. (§29.8)

## Properties

### transport

> `readonly` **transport**: [`ConformanceTransport`](../type-aliases/ConformanceTransport.md)

Defined in: [protocol/conformance-requirements.ts:791](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L791)

The transport being evaluated.

***

### authorizationApplies

> `readonly` **authorizationApplies**: `boolean`

Defined in: [protocol/conformance-requirements.ts:793](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L793)

Whether the authorization framework SHOULD apply (HTTP) — R-29.8-d.

***

### authorizationForbidden

> `readonly` **authorizationForbidden**: `boolean`

Defined in: [protocol/conformance-requirements.ts:795](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L795)

Whether the authorization framework SHOULD NOT apply (stdio) — R-29.8-e.

***

### credentialConveyance

> `readonly` **credentialConveyance**: [`CredentialConveyance`](../type-aliases/CredentialConveyance.md)

Defined in: [protocol/conformance-requirements.ts:797](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L797)

How credentials are conveyed for this transport.
