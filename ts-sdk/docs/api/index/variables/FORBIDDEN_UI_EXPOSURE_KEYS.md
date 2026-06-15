[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / FORBIDDEN\_UI\_EXPOSURE\_KEYS

# Variable: FORBIDDEN\_UI\_EXPOSURE\_KEYS

> `const` **FORBIDDEN\_UI\_EXPOSURE\_KEYS**: readonly `string`[]

Defined in: [protocol/ui-host.ts:1092](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1092)

The keys a host MUST NOT expose to the UI: credentials, authorization tokens
(§23), and unrelated conversation/context data. Only the tool input/result the
UI was rendered for and host context delivered through the dialect are
permitted. (§26.7, R-26.7-m; AC-42.17)

This list is illustrative of the categories a host must withhold; the
authoritative rule is the inclusion test [uiExposureIsClean](../functions/uiExposureIsClean.md), which keys
off an allow-list rather than a deny-list.
