[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceTeardownParamsSchema

# Variable: ResourceTeardownParamsSchema

> `const` **ResourceTeardownParamsSchema**: `ZodObject`\<\{ `reason`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `reason`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `reason`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui-host.ts:650](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L650)

`ResourceTeardownParams` — params of the `ui/resource-teardown` request
(Host → UI). The UI SHOULD release resources and respond with `{}`. (§26.5.4,
R-26.5.4-a; AC-42.11)
