[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProtocolVersionValidationOptions

# Interface: ProtocolVersionValidationOptions

Defined in: [transport/http/headers.ts:227](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L227)

Options for [validateProtocolVersionHeader](../functions/validateProtocolVersionHeader.md).

## Properties

### supportedVersions

> **supportedVersions**: readonly `string`[]

Defined in: [transport/http/headers.ts:229](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L229)

The protocol revisions this server implements.

***

### supportsPreHeaderClients?

> `optional` **supportsPreHeaderClients?**: `boolean`

Defined in: [transport/http/headers.ts:235](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L235)

When `true`, a request that omits the `MCP-Protocol-Version` header is
treated as the earliest revision that predates the header rather than being
rejected. (R-9.3.3-c) Defaults to `false` (reject absent header).

***

### earliestRevision?

> `optional` **earliestRevision?**: `string`

Defined in: [transport/http/headers.ts:237](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L237)

The revision assumed for a header-less request when the above is `true`.
