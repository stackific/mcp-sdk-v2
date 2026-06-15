[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / ClientOptions

# Interface: ClientOptions

Defined in: client/client.ts:92

Construction options for [Client](../classes/Client.md).

## Properties

### capabilities?

> `optional` **capabilities?**: `Record`\<`string`, `unknown`\>

Defined in: client/client.ts:94

Capabilities declared in every request's `_meta`. (§6.2) Defaults to `{}`.

***

### protocolVersions?

> `optional` **protocolVersions?**: `string`[]

Defined in: client/client.ts:96

Acceptable protocol revisions, most-preferred first. Defaults to `[CURRENT_PROTOCOL_VERSION]`.
