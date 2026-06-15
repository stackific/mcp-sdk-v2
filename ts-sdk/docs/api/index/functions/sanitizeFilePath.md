[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / sanitizeFilePath

# Function: sanitizeFilePath()

> **sanitizeFilePath**(`requestedPath`, `authorizedRoot`): [`FilePathValidation`](../type-aliases/FilePathValidation.md)

Defined in: [protocol/security.ts:1576](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1576)

Sanitizes a requested `file://` resource path against an authorized root,
rejecting directory-traversal and any path that escapes the root. (§28.10,
R-28.10-o, R-28.10-p; AC-44.30)

A server MUST sanitize file paths to prevent directory traversal (e.g. `..`
segments) and MUST NOT serve a file outside the authorized directories. The check
is purely lexical (no filesystem I/O): it normalizes `.`/`..` segments
POSIX-style and confirms the result stays within `authorizedRoot`. A path that
normalizes to outside the root — via `..` or an absolute escape — is rejected.

## Parameters

### requestedPath

`string`

The requested file path (relative to, or under, the root). (R-28.10-o)

### authorizedRoot

`string`

The absolute root directory the user has authorized. (R-28.10-p)

## Returns

[`FilePathValidation`](../type-aliases/FilePathValidation.md)
