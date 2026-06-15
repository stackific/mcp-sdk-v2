[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / requirementsForRole

# Function: requirementsForRole()

> **requirementsForRole**(`role`): [`ConformanceRequirement`](../interfaces/ConformanceRequirement.md)[]

Defined in: [protocol/conformance-requirements.ts:354](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L354)

Returns every requirement that binds `role`. A requirement with an empty
`roles` list binds every role; otherwise it binds only the named roles.
(§29.1 item 1)

## Parameters

### role

[`ConformanceRole`](../type-aliases/ConformanceRole.md)

## Returns

[`ConformanceRequirement`](../interfaces/ConformanceRequirement.md)[]
