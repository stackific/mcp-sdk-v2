[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SERVER\_SDK\_OBLIGATIONS

# Variable: SERVER\_SDK\_OBLIGATIONS

> `const` **SERVER\_SDK\_OBLIGATIONS**: readonly \[`"acknowledge-extension"`, `"declare-ui-meta"`, `"serve-ui-resource"`\]

Defined in: [protocol/ui-host.ts:1190](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1190)

The server-side obligations of this extension. A server-side implementation
MUST support all three. (§26.9, R-26.9-a, R-26.9-b, R-26.9-c; AC-42.22–AC-42.24)

  - `acknowledge-extension` — acknowledge `io.modelcontextprotocol/ui` in the
    `server/discover` result when the host advertises it (R-26.9-a);
  - `declare-ui-meta`       — declare the UI association via `_meta.ui` with
    `resourceUri` and OPTIONAL `visibility` (R-26.9-b);
  - `serve-ui-resource`     — serve the `ui://` resource via `resources/read`
    with the `text/html;profile=mcp-app` MIME type (R-26.9-c).
