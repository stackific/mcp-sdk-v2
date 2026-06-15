[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TASKS\_EXTENSION\_ID

# Variable: TASKS\_EXTENSION\_ID

> `const` **TASKS\_EXTENSION\_ID**: `"io.modelcontextprotocol/tasks"`

Defined in: [protocol/tasks.ts:66](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L66)

The exact, case-sensitive identifier of the Tasks extension. (§25.1, R-25.1-a)

This is the key used in the extensions capability map. A conforming
implementation MUST treat it as an opaque, exact string and MUST NOT match it
case-insensitively or by prefix — use [isTasksExtensionId](../functions/isTasksExtensionId.md), never an
ad-hoc comparison.
