[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ConformanceProfileViolation

# Interface: ConformanceProfileViolation

Defined in: [protocol/conformance-requirements.ts:849](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L849)

A single way a [ConformanceProfile](ConformanceProfile.md) fails to be well-formed.

## Properties

### field

> **field**: `"extensions"` \| `"capabilities"` \| `"roles"` \| `"revisions"` \| `"transports"`

Defined in: [protocol/conformance-requirements.ts:851](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L851)

Which profile field the violation concerns.

***

### message

> **message**: `string`

Defined in: [protocol/conformance-requirements.ts:853](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L853)

Human-readable description of the violation, citing the requirement.
