[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ConformanceProfile

# Interface: ConformanceProfile

Defined in: [protocol/conformance-requirements.ts:835](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L835)

The abstract descriptor that fully describes an implementation's conformance:
the tuple of roles, advertised revisions, advertised capabilities, advertised
extensions, and implemented transports. (§29.9 item 3, story §6) NOT a wire
message — it is used to reason about and report conformance.

## Properties

### roles

> **roles**: readonly [`ConformanceRole`](../type-aliases/ConformanceRole.md)[]

Defined in: [protocol/conformance-requirements.ts:837](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L837)

The role(s) the implementation plays; binds it to each role's requirements. (R-29.1-b)

***

### revisions

> **revisions**: readonly `string`[]

Defined in: [protocol/conformance-requirements.ts:839](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L839)

The advertised protocol revisions; MUST include the wire value `2026-07-28`. (R-29.9-c)

***

### capabilities

> **capabilities**: readonly `string`[]

Defined in: [protocol/conformance-requirements.ts:841](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L841)

The advertised capability identifiers (Appendix D / §6).

***

### extensions

> **extensions**: readonly `string`[]

Defined in: [protocol/conformance-requirements.ts:843](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L843)

The advertised extension identifiers; MAY be empty (zero extensions is conformant). (R-29.5-a)

***

### transports

> **transports**: readonly [`ConformanceTransport`](../type-aliases/ConformanceTransport.md)[]

Defined in: [protocol/conformance-requirements.ts:845](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L845)

The implemented transports; at least one, each independently conformant. (R-29.8-a)
