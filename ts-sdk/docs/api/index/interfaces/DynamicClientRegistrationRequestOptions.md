[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DynamicClientRegistrationRequestOptions

# Interface: DynamicClientRegistrationRequestOptions

Defined in: [protocol/authorization-flow.ts:438](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L438)

Inputs to [buildDynamicClientRegistrationRequest](../functions/buildDynamicClientRegistrationRequest.md).

## Properties

### redirectUris

> **redirectUris**: `string`[]

Defined in: [protocol/authorization-flow.ts:440](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L440)

REQUIRED allowed redirection URIs. (R-23.4-m)

***

### applicationType

> **applicationType**: [`ApplicationType`](../type-aliases/ApplicationType.md)

Defined in: [protocol/authorization-flow.ts:442](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L442)

REQUIRED `application_type`; see [applicationTypeFor](../functions/applicationTypeFor.md). (R-23.4-m)

***

### clientName?

> `optional` **clientName?**: `string`

Defined in: [protocol/authorization-flow.ts:444](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L444)

OPTIONAL human-readable client name.

***

### grantTypes?

> `optional` **grantTypes?**: `string`[]

Defined in: [protocol/authorization-flow.ts:449](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L449)

OPTIONAL requested grant types. A client desiring refresh capability SHOULD
include `refresh_token` here. (R-23.9-a)

***

### responseTypes?

> `optional` **responseTypes?**: `string`[]

Defined in: [protocol/authorization-flow.ts:451](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L451)

OPTIONAL requested response types.

***

### tokenEndpointAuthMethod?

> `optional` **tokenEndpointAuthMethod?**: `string`

Defined in: [protocol/authorization-flow.ts:453](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L453)

OPTIONAL token-endpoint auth method.

***

### scope?

> `optional` **scope?**: `string`

Defined in: [protocol/authorization-flow.ts:455](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L455)

OPTIONAL space-delimited scopes.
