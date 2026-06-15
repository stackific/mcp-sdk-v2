[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / interpretProbeResponse

# Function: interpretProbeResponse()

> **interpretProbeResponse**(`response`): [`ProbeOutcome`](../type-aliases/ProbeOutcome.md)

Defined in: [protocol/negotiation.ts:231](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L231)

Interprets a response to a probe `server/discover` request. (§5.7)

Classification:
  - A success carrying a valid `DiscoverResult` → `'supported'`; the client
    reads `supportedVersions` and applies the selection rule.
  - A recognized `UnsupportedProtocolVersion` (`-32004`) error whose `data`
    carries `supported` → `'unsupported-version'`; the client re-selects from
    `data.supported` rather than abandoning the protocol.
  - Anything else — a different error code, a malformed response, or no
    response (pass `undefined`/`null` for a transport timeout) — →
    `'not-this-protocol'`: the client MUST treat the server as not speaking
    this protocol revision. (R-5.7-c)

## Parameters

### response

`unknown`

The JSON-RPC response object, or `null`/`undefined` for a timeout.

## Returns

[`ProbeOutcome`](../type-aliases/ProbeOutcome.md)
