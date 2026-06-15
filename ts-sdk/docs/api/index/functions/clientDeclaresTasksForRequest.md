[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientDeclaresTasksForRequest

# Function: clientDeclaresTasksForRequest()

> **clientDeclaresTasksForRequest**(`requestClientExtensions`): `boolean`

Defined in: [protocol/tasks.ts:139](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L139)

Returns `true` when a request's declared client `extensions` map opts that
request in for task augmentation — i.e. it advertises [TASKS\_EXTENSION\_ID](../variables/TASKS_EXTENSION_ID.md).
(§25.2, R-25.2-c)

Because the protocol is stateless and per-request, a request is eligible for
augmentation ONLY when this declaration is present in THAT request's
capabilities; a request lacking it is not eligible. (R-25.2-c)

## Parameters

### requestClientExtensions

`unknown`

The `extensions` map from this request's
  `io.modelcontextprotocol/clientCapabilities` (raw; `undefined` ⇒ none).

## Returns

`boolean`
