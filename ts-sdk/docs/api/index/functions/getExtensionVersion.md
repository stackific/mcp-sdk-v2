[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / getExtensionVersion

# Function: getExtensionVersion()

> **getExtensionVersion**(`extensionsMap`, `identifier`, `versionKey?`): `string` \| `undefined`

Defined in: [protocol/extension-mechanism.ts:471](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L471)

Reads an extension's version from the settings object it advertised, making
the version discoverable purely through negotiation. (R-24.6-a, R-24.6-b)

The version is taken from the settings' `version` field when it is a string or
a number (numbers are normalized to their string form). It is NEVER inferred
from out-of-band information — when the extension is not advertised, or carries
no `version`, this returns `undefined`. (R-24.6-b)

## Parameters

### extensionsMap

`unknown`

A peer's advertised `extensions` map (raw).

### identifier

`string`

The extension whose version to read.

### versionKey?

`string` = `'version'`

The settings key carrying the version (default
  `'version'`); an extension MAY use a different key per its own rules.

## Returns

`string` \| `undefined`
