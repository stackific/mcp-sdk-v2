[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / declineErrorCode

# Function: declineErrorCode()

> **declineErrorCode**(`reason`): `number`

Defined in: [protocol/ui-host.ts:861](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L861)

Maps a [DeclineReason](../type-aliases/DeclineReason.md) to the §22 error code a host returns when it
declines a UI-initiated request. (§26.8, R-26.8-b; AC-42.20)

  - `unknown-method` → `-32601` Method not found (R-26.8-c);
  - `invalid-params` → `-32602` Invalid params;
  - `no-consent` / `policy` → `-32603` Internal error (the host refused to act).

Whichever reason applies, the host MUST return an error — never a silent drop.

## Parameters

### reason

[`DeclineReason`](../type-aliases/DeclineReason.md)

## Returns

`number`
