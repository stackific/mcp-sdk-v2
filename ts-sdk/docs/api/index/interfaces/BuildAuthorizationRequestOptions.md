[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / BuildAuthorizationRequestOptions

# Interface: BuildAuthorizationRequestOptions

Defined in: [protocol/authorization-flow.ts:846](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L846)

Inputs to [buildAuthorizationRequest](../functions/buildAuthorizationRequest.md).

## Properties

### clientId

> **clientId**: `string`

Defined in: [protocol/authorization-flow.ts:848](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L848)

The client identifier from registration.

***

### redirectUri

> **redirectUri**: `string`

Defined in: [protocol/authorization-flow.ts:850](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L850)

MUST match one registered for the client. (R-23.5-e)

***

### resource

> **resource**: `string`

Defined in: [protocol/authorization-flow.ts:852](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L852)

The canonical resource identifier of the target MCP server. (R-23.5-j, R-23.6-d)

***

### record

> **record**: [`AuthorizationFlowRecord`](AuthorizationFlowRecord.md)

Defined in: [protocol/authorization-flow.ts:854](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L854)

The Step-1 record carrying the PKCE challenge and `state`.

***

### scope?

> `optional` **scope?**: `string`

Defined in: [protocol/authorization-flow.ts:856](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L856)

OPTIONAL pre-resolved `scope` (see [resolveAuthorizationScope](../functions/resolveAuthorizationScope.md)).

***

### serverMetadata?

> `optional` **serverMetadata?**: `Pick`\<`objectOutputType`\<\{ `issuer`: `ZodString`; `authorization_endpoint`: `ZodString`; `token_endpoint`: `ZodString`; `registration_endpoint`: `ZodOptional`\<`ZodString`\>; `scopes_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `grant_types_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `code_challenge_methods_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_methods_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `authorization_response_iss_parameter_supported`: `ZodOptional`\<`ZodBoolean`\>; `client_id_metadata_document_supported`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `"code_challenge_methods_supported"`\>

Defined in: [protocol/authorization-flow.ts:863](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L863)

OPTIONAL authorization-server metadata. When provided, the builder verifies
PKCE `S256` support and refuses (throws [PkceSupportError](../classes/PkceSupportError.md)) if it cannot
be confirmed — enforcing §28.5 (R-28.5-k). Callers that do not pass it here
MUST call [assertPkceSupportConfirmed](../functions/assertPkceSupportConfirmed.md) themselves before proceeding.
