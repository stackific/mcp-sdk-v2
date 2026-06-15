[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RegistryMethodKind

# Variable: RegistryMethodKind

> `const` **RegistryMethodKind**: `object`

Defined in: [protocol/registries.ts:95](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L95)

The [MethodNotificationIndexEntry.kind](../interfaces/MethodNotificationIndexEntry.md#kind) column of Appendix A: whether a
name is a request (expects a response), a notification (no response), or an
input-request kind delivered embedded in an input-required result (§11) rather
than as a standalone server-initiated request. (Appendix A)

## Type Declaration

### REQUEST

> `readonly` **REQUEST**: `"request"` = `'request'`

A request that expects a response.

### NOTIFICATION

> `readonly` **NOTIFICATION**: `"notification"` = `'notification'`

A notification — no response is sent.

### INPUT\_REQUEST

> `readonly` **INPUT\_REQUEST**: `"input-request kind"` = `'input-request kind'`

An input-request kind (`elicitation/create`, `sampling/createMessage`,
`roots/list`): delivered inside an input-required result and resolved by
client retry (§11); NOT a standalone server-initiated JSON-RPC request.
