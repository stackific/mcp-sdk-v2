[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayExpectPromptsListChanged

# Function: mayExpectPromptsListChanged()

> **mayExpectPromptsListChanged**(`serverCaps`): `boolean`

Defined in: [protocol/prompts.ts:164](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L164)

Returns `true` when a client may expect `notifications/prompts/list_changed`
from a server — i.e. the server declared `prompts.listChanged: true`. When the
sub-flag is absent or `false`, a client MUST NOT rely on receiving it.
(R-18.1-e, R-18.1-f, R-18.6-g, AC-28.6, AC-28.39)

Delegates to `clientShouldExpectNotification` (S10), whose gating map already
ties this notification to `prompts.listChanged`.

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
