[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RegistrationMechanismSelection

# Interface: RegistrationMechanismSelection

Defined in: [protocol/authorization-registration.ts:124](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L124)

The mechanism chosen by [selectRegistrationMechanism](../functions/selectRegistrationMechanism.md), with the reason it applied.

## Properties

### mechanism

> **mechanism**: [`ClientIdMechanism`](../type-aliases/ClientIdMechanism.md)

Defined in: [protocol/authorization-registration.ts:126](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L126)

The selected mechanism, or `'prompt'` when none applies. (R-23.11-b)

***

### reason

> **reason**: `string`

Defined in: [protocol/authorization-registration.ts:128](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L128)

Human-readable explanation of why this mechanism was selected.
