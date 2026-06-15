[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateProtocolVersionHeader

# Function: validateProtocolVersionHeader()

> **validateProtocolVersionHeader**(`headers`, `body`, `options`): [`ProtocolVersionResult`](../type-aliases/ProtocolVersionResult.md)

Defined in: [transport/http/headers.ts:267](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L267)

Validates the `MCP-Protocol-Version` header against the body and the server's
supported revisions. (§9.3.3)

  - Absent header → reject `400` + `-32001`, unless `supportsPreHeaderClients`
    is set, in which case the request is treated as `earliestRevision`.
    (R-9.3.3-b, R-9.3.3-c)
  - Header ≠ body `_meta` protocolVersion → reject `400` + `-32001`. (R-9.3.3-d)
  - Header valid but revision unimplemented → reject `400` + `-32004`
    (`UnsupportedProtocolVersion`) naming `supported`/`requested`. (R-9.3.3-e)

## Parameters

### headers

[`HttpHeaders`](../type-aliases/HttpHeaders.md)

### body

`unknown`

### options

[`ProtocolVersionValidationOptions`](../interfaces/ProtocolVersionValidationOptions.md)

## Returns

[`ProtocolVersionResult`](../type-aliases/ProtocolVersionResult.md)
