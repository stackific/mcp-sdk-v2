[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ConformanceRequirement

# Interface: ConformanceRequirement

Defined in: [protocol/conformance-requirements.ts:196](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L196)

One normative requirement ("atom") of §29/§30, identified by its stable
requirement id, the section it belongs to, the role(s)/axis it binds, and its
RFC 2119 level. This is the data form of the story's §7 behavior table; a
conformance harness enumerates it to know exactly what to check.

## Properties

### id

> `readonly` **id**: `string`

Defined in: [protocol/conformance-requirements.ts:198](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L198)

The stable requirement id, e.g. `"R-29.2-h"`. (story §10 traceability)

***

### section

> `readonly` **section**: `string`

Defined in: [protocol/conformance-requirements.ts:200](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L200)

The §29/§30 subsection this atom belongs to, e.g. `"29.2"`.

***

### keyword

> `readonly` **keyword**: `"MUST"` \| `"SHOULD"` \| `"MAY"` \| `"MUST NOT"` \| `"REQUIRED"` \| `"SHALL"` \| `"SHALL NOT"` \| `"SHOULD NOT"` \| `"RECOMMENDED"` \| `"OPTIONAL"`

Defined in: [protocol/conformance-requirements.ts:202](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L202)

The RFC 2119 keyword exactly as the story marks it. (§2)

***

### level

> `readonly` **level**: [`RequirementLevel`](../type-aliases/RequirementLevel.md)

Defined in: [protocol/conformance-requirements.ts:204](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L204)

The canonical level family derived from [keyword](#keyword).

***

### axis

> `readonly` **axis**: [`ConformanceAxis`](../type-aliases/ConformanceAxis.md)

Defined in: [protocol/conformance-requirements.ts:206](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L206)

Which conformance axis the requirement constrains. (§29.1)

***

### roles

> `readonly` **roles**: readonly [`ConformanceRole`](../type-aliases/ConformanceRole.md)[]

Defined in: [protocol/conformance-requirements.ts:208](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L208)

The role(s) the requirement binds; empty ⇒ binds every role. (§29.1)

***

### statement

> `readonly` **statement**: `string`

Defined in: [protocol/conformance-requirements.ts:210](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L210)

A one-line restatement of the obligation.
