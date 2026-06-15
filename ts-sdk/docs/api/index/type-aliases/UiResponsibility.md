[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiResponsibility

# Type Alias: UiResponsibility

> **UiResponsibility** = `"declare-ui-meta"` \| `"serve-ui-resource"` \| `"render"` \| `"sandbox"` \| `"enforce-csp"` \| `"run-channel"` \| `"mediate-consent"`

Defined in: [protocol/ui.ts:139](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L139)

The discrete responsibilities the apps extension assigns, each fixed to a
single role. (§26.1, R-26.1-b..h)

  - `declare-ui-meta`   — declare the UI association via `_meta.ui` (server);
  - `serve-ui-resource` — serve the `ui://` resource via `resources/read` (server);
  - `render`            — render the UI (host);
  - `sandbox`           — render in a sandboxed, isolated browsing context (host);
  - `enforce-csp`       — enforce CSP and permissions (host);
  - `run-channel`       — run the message-channel dialect of §26.5 (host);
  - `mediate-consent`   — mediate and obtain user consent (host).
