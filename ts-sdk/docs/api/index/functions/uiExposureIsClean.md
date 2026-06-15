[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / uiExposureIsClean

# Function: uiExposureIsClean()

> **uiExposureIsClean**(`exposed`): `boolean`

Defined in: [protocol/ui-host.ts:1126](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1126)

Returns `true` when the data a host is about to expose to the UI contains ONLY
permitted categories — every top-level key is in [ALLOWED\_UI\_EXPOSURE\_KEYS](../variables/ALLOWED_UI_EXPOSURE_KEYS.md).
Any other key (a credential, token, cookie, or unrelated conversation/context
datum) makes the exposure dirty. (§26.7, R-26.7-m; AC-42.17)

The check is allow-list based (not merely "no forbidden key present"), so an
unforeseen leaking key is caught too.

## Parameters

### exposed

`Record`\<`string`, `unknown`\>

The object a host intends to hand to the UI.

## Returns

`boolean`
