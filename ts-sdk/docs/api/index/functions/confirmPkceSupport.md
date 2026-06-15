[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / confirmPkceSupport

# Function: confirmPkceSupport()

> **confirmPkceSupport**(`metadata`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [protocol/authorization-flow.ts:805](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L805)

Confirms, from authorization-server metadata, that the AS supports PKCE with
the `S256` challenge method. (§28.5, R-28.5-k)

§28.5 requires a client to use PKCE `S256` where capable AND to verify via AS
metadata that the server supports it before proceeding — refusing to proceed if
support cannot be confirmed. Support is confirmable ONLY when
`code_challenge_methods_supported` is present AND includes `"S256"`; an absent
field means support is unconfirmable (the client MUST refuse).

## Parameters

### metadata

`Pick`\<[`AuthorizationServerMetadata`](../type-aliases/AuthorizationServerMetadata.md), `"code_challenge_methods_supported"`\>

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}
