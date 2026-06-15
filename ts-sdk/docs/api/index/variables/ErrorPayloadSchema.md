[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ErrorPayloadSchema

# Variable: ErrorPayloadSchema

> `const` **ErrorPayloadSchema**: `ZodObject`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `"strip"`, `ZodTypeAny`, \{ `code`: `number`; `message`: `string`; `data?`: `unknown`; \}, \{ `code`: `number`; `message`: `string`; `data?`: `unknown`; \}\>

Defined in: [protocol/messages.ts:56](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/messages.ts#L56)

Abstract error payload schema (§2.2).

Carries a numeric `code`, a human-readable `message`, and optional `data`.
Standard JSON-RPC codes and MCP-specific codes are defined in S04 and S09.
