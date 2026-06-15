[**@stackific/mcp-sdk-ts**](../README.md)

***

[@stackific/mcp-sdk-ts](../README.md) / client

# client

## Classes

- [RequestError](classes/RequestError.md)
- [Client](classes/Client.md)
- [StreamableHTTPClientTransport](classes/StreamableHTTPClientTransport.md)

## Interfaces

- [RequestOptions](interfaces/RequestOptions.md)
- [ClientOptions](interfaces/ClientOptions.md)
- [ListResult](interfaces/ListResult.md)
- [SubscriptionHandle](interfaces/SubscriptionHandle.md)
- [PkcePair](interfaces/PkcePair.md)
- [DiscoveredOAuthMetadata](interfaces/DiscoveredOAuthMetadata.md)
- [OAuthTokenResponse](interfaces/OAuthTokenResponse.md)
- [RetryOptions](interfaces/RetryOptions.md)
- [AuthProvider](interfaces/AuthProvider.md)
- [StreamableHTTPClientTransportOptions](interfaces/StreamableHTTPClientTransportOptions.md)

## Type Aliases

- [RequestHandler](type-aliases/RequestHandler.md)
- [NotificationHandler](type-aliases/NotificationHandler.md)
- [ProgressHandler](type-aliases/ProgressHandler.md)

## Functions

- [createPkcePair](functions/createPkcePair.md)
- [assertPkceSupported](functions/assertPkceSupported.md)
- [discoverOAuthMetadata](functions/discoverOAuthMetadata.md)
- [registerClient](functions/registerClient.md)
- [buildAuthorizeUrl](functions/buildAuthorizeUrl.md)
- [exchangeAuthorizationCode](functions/exchangeAuthorizationCode.md)
- [refreshAccessToken](functions/refreshAccessToken.md)
- [createAuthProvider](functions/createAuthProvider.md)
- [createRetryingTransport](functions/createRetryingTransport.md)

## References

### SubscriptionFilter

Re-exports [SubscriptionFilter](../index/type-aliases/SubscriptionFilter.md)

***

### ListToolsResult

Re-exports [ListToolsResult](../index/type-aliases/ListToolsResult.md)

***

### CallToolResult

Re-exports [CallToolResult](../index/type-aliases/CallToolResult.md)

***

### ListResourcesResult

Re-exports [ListResourcesResult](../index/type-aliases/ListResourcesResult.md)

***

### ListResourceTemplatesResult

Re-exports [ListResourceTemplatesResult](../index/type-aliases/ListResourceTemplatesResult.md)

***

### ReadResourceResult

Re-exports [ReadResourceResult](../index/type-aliases/ReadResourceResult.md)

***

### ListPromptsResult

Re-exports [ListPromptsResult](../index/type-aliases/ListPromptsResult.md)

***

### GetPromptResult

Re-exports [GetPromptResult](../index/type-aliases/GetPromptResult.md)

***

### CompleteResult

Re-exports [CompleteResult](../index/type-aliases/CompleteResult.md)
