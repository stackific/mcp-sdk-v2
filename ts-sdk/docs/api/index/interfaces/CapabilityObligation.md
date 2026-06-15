[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CapabilityObligation

# Interface: CapabilityObligation

Defined in: [protocol/conformance-requirements.ts:365](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L365)

One capability-conditioned obligation: advertising `capability` binds the
advertising `party` to the MUST-level requirements of `section`. (§29.4 item 1,
R-29.4-b – R-29.4-g) The data form of "advertise implies implement".

## Properties

### capability

> `readonly` **capability**: `"tools"` \| `"experimental"` \| `"elicitation"` \| `"roots"` \| `"sampling"` \| `"extensions"` \| `"completions"` \| `"prompts"` \| `"resources"` \| `"logging"` \| `"elicitation.form"` \| `"elicitation.url"` \| `"sampling.context"` \| `"sampling.tools"` \| `"prompts.listChanged"` \| `"resources.subscribe"` \| `"resources.listChanged"` \| `"tools.listChanged"`

Defined in: [protocol/conformance-requirements.ts:367](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L367)

The advertised capability identifier (Appendix D / §6).

***

### party

> `readonly` **party**: [`ConformanceRole`](../type-aliases/ConformanceRole.md)

Defined in: [protocol/conformance-requirements.ts:369](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L369)

Which party advertises and is thereby bound.

***

### section

> `readonly` **section**: `string`

Defined in: [protocol/conformance-requirements.ts:371](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L371)

The spec section whose MUST-level behavior the advertiser must satisfy.

***

### additionalSections

> `readonly` **additionalSections**: readonly `string`[]

Defined in: [protocol/conformance-requirements.ts:373](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L373)

Any additional sections also bound by this capability (e.g. subscriptions → §10).
