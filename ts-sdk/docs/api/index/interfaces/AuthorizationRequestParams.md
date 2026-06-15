[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AuthorizationRequestParams

# Interface: AuthorizationRequestParams

Defined in: [protocol/authorization-flow.ts:761](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L761)

The authorization-request query parameters directing the user agent to the
`authorization_endpoint`. (§23.5, R-23.5-d – R-23.5-j)

Field names mirror the on-the-wire OAuth parameters. `response_type`,
`code_challenge_method`, `client_id`, `redirect_uri`, `code_challenge`, and
`resource` are always present; `scope` and `state` are present when available.

## Properties

### response\_type

> **response\_type**: `"code"`

Defined in: [protocol/authorization-flow.ts:763](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L763)

MUST be `code`. (R-23.5-d)

***

### client\_id

> **client\_id**: `string`

Defined in: [protocol/authorization-flow.ts:765](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L765)

The client identifier from registration.

***

### redirect\_uri

> **redirect\_uri**: `string`

Defined in: [protocol/authorization-flow.ts:767](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L767)

MUST match one registered for the client. (R-23.5-e)

***

### scope?

> `optional` **scope?**: `string`

Defined in: [protocol/authorization-flow.ts:769](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L769)

Requested scopes; omitted when none determinable. (R-23.5-f)

***

### state?

> `optional` **state?**: `string`

Defined in: [protocol/authorization-flow.ts:771](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L771)

Opaque, unguessable session-binding value. (R-23.5-g)

***

### code\_challenge

> **code\_challenge**: `string`

Defined in: [protocol/authorization-flow.ts:773](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L773)

`BASE64URL(SHA-256(code_verifier))`. (R-23.5-b)

***

### code\_challenge\_method

> **code\_challenge\_method**: `"S256"`

Defined in: [protocol/authorization-flow.ts:775](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L775)

MUST be `S256`. (R-23.5-i)

***

### resource

> **resource**: `string`

Defined in: [protocol/authorization-flow.ts:777](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L777)

Canonical resource identifier of the target MCP server. (R-23.5-j, R-23.6-b)
