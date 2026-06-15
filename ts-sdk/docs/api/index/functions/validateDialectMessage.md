[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateDialectMessage

# Function: validateDialectMessage()

> **validateDialectMessage**(`raw`): [`DialectMessageValidation`](../type-aliases/DialectMessageValidation.md)

Defined in: [protocol/ui-host.ts:774](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L774)

Validates an incoming dialect message against the §3 JSON-RPC framing BEFORE a
host acts on it, treating the rendered content as untrusted. (§26.7,
R-26.7-n, R-26.7-o; AC-42.18)

Steps:
  1. Classify the raw value with the S03 [classifyMessage](classifyMessage.md) (rejects
     batches, bad `jsonrpc`, contradictory members, …). A framing failure is
     reported as `malformed-framing` — the host MUST NOT act on it.
  2. For requests and notifications, require the `method` to be a verbatim
     dialect name (responses carry no method and pass framing-only). An
     unrecognized method is reported as `unknown-method`; a receiver MUST then
     answer a *request* with method-not-found (R-26.8-c) — see
     [methodNotFoundResponse](methodNotFoundResponse.md).

This never throws: a malformed message yields `{ ok: false, … }` rather than
propagating [MalformedMessageError](../classes/MalformedMessageError.md), so a host can branch on the result.

## Parameters

### raw

`unknown`

The raw incoming message value (untrusted).

## Returns

[`DialectMessageValidation`](../type-aliases/DialectMessageValidation.md)
