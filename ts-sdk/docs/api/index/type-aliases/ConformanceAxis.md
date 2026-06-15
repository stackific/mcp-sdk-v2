[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ConformanceAxis

# Type Alias: ConformanceAxis

> **ConformanceAxis** = `"role"` \| `"feature"` \| `"transport"`

Defined in: [protocol/conformance-requirements.ts:109](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L109)

The three independent axes along which conformance is scoped. (§29.1)
Conformance is the product of these: an implementation is conformant iff every
applicable requirement on its chosen roles, advertised features, and
implemented transports is satisfied.

  - `role`      — client / server / both (§29.1 item 1);
  - `feature`   — baseline plus advertised capabilities/extensions (§29.1 item 2);
  - `transport` — each transport, independently (§29.1 item 3).
