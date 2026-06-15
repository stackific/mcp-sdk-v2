[**@stackific/mcp-sdk-ts**](../README.md)

***

[@stackific/mcp-sdk-ts](../README.md) / server

# server

## Classes

- [ServerError](classes/ServerError.md)
- [McpServer](classes/McpServer.md)
- [InMemoryTaskStore](classes/InMemoryTaskStore.md)

## Interfaces

- [ProtectedResourceMetadataInit](interfaces/ProtectedResourceMetadataInit.md)
- [BearerAuthGateOptions](interfaces/BearerAuthGateOptions.md)
- [CacheHints](interfaces/CacheHints.md)
- [HonoLikeContext](interfaces/HonoLikeContext.md)
- [RequestContext](interfaces/RequestContext.md)
- [ToolResult](interfaces/ToolResult.md)
- [TaskStore](interfaces/TaskStore.md)
- [ToolContext](interfaces/ToolContext.md)
- [ToolDef](interfaces/ToolDef.md)
- [ResourceDef](interfaces/ResourceDef.md)
- [ResourceTemplateDef](interfaces/ResourceTemplateDef.md)
- [PromptArg](interfaces/PromptArg.md)
- [PromptDef](interfaces/PromptDef.md)
- [McpServerOptions](interfaces/McpServerOptions.md)
- [McpRequestHandlerOptions](interfaces/McpRequestHandlerOptions.md)
- [InMemoryTaskStoreOptions](interfaces/InMemoryTaskStoreOptions.md)
- [UiToolResultOptions](interfaces/UiToolResultOptions.md)

## Type Aliases

- [ToolHandler](type-aliases/ToolHandler.md)
- [ResourceReader](type-aliases/ResourceReader.md)
- [TemplateReader](type-aliases/TemplateReader.md)
- [PromptHandler](type-aliases/PromptHandler.md)
- [AuthGate](type-aliases/AuthGate.md)

## Variables

- [METHOD\_NOT\_FOUND\_CODE](variables/METHOD_NOT_FOUND_CODE.md)
- [INTERNAL\_ERROR\_CODE](variables/INTERNAL_ERROR_CODE.md)

## Functions

- [buildProtectedResourceMetadata](functions/buildProtectedResourceMetadata.md)
- [bearerAuthGate](functions/bearerAuthGate.md)
- [withCacheHints](functions/withCacheHints.md)
- [toHonoMcpHandler](functions/toHonoMcpHandler.md)
- [serveStdio](functions/serveStdio.md)
- [createMcpRequestHandler](functions/createMcpRequestHandler.md)
- [uiResource](functions/uiResource.md)
- [uiToolResult](functions/uiToolResult.md)

## References

### UI\_MIME\_TYPE

Re-exports [UI_MIME_TYPE](../index/variables/UI_MIME_TYPE.md)

***

### UI\_URI\_SCHEME

Re-exports [UI_URI_SCHEME](../index/variables/UI_URI_SCHEME.md)

***

### isUiResourceUri

Re-exports [isUiResourceUri](../index/functions/isUiResourceUri.md)

***

### UiVisibility

Re-exports [UiVisibility](../index/type-aliases/UiVisibility.md)

***

### buildInputRequiredResult

Re-exports [buildInputRequiredResult](../index/functions/buildInputRequiredResult.md)

***

### buildReRequestInputRequiredResult

Re-exports [buildReRequestInputRequiredResult](../index/functions/buildReRequestInputRequiredResult.md)

***

### computeMissingInputResponseKeys

Re-exports [computeMissingInputResponseKeys](../index/functions/computeMissingInputResponseKeys.md)

***

### mayEmitInputRequestKind

Re-exports [mayEmitInputRequestKind](../index/functions/mayEmitInputRequestKind.md)

***

### requiredClientCapabilityForInputRequest

Re-exports [requiredClientCapabilityForInputRequest](../index/functions/requiredClientCapabilityForInputRequest.md)
