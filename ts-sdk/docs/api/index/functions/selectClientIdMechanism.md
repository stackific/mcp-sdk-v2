[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / selectClientIdMechanism

# Function: selectClientIdMechanism()

> **selectClientIdMechanism**(`supported`): [`ClientIdMechanism`](../type-aliases/ClientIdMechanism.md)

Defined in: [protocol/authorization-flow.ts:237](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L237)

Selects the `client_id` mechanism to use from those a client supports, applying
the priority order pre-registration → CIMD → DCR → user prompt. (R-23.4-a,
R-23.4-b)

Returns the highest-priority supported mechanism. When `supported` is empty the
client falls back to prompting the user, so `'prompt'` is returned.

## Parameters

### supported

`Iterable`\<[`ClientIdMechanism`](../type-aliases/ClientIdMechanism.md)\>

The mechanisms this client supports (order irrelevant).

## Returns

[`ClientIdMechanism`](../type-aliases/ClientIdMechanism.md)
