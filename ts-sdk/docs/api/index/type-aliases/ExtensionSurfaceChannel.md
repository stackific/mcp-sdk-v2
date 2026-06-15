[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionSurfaceChannel

# Type Alias: ExtensionSurfaceChannel

> **ExtensionSurfaceChannel** = `"method"` \| `"meta-key"` \| `"result-type"` \| `"field"`

Defined in: [protocol/extension-mechanism.ts:218](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L218)

The four — and ONLY four — channels through which an active extension may
extend the protocol surface. (§24.5, R-24.5-a) Adding surface through any
other channel is non-conformant.

  - `method`          — additional request methods and notifications (R-24.5-b);
  - `meta-key`        — additional reserved `_meta` keys under a controlled
                        vendor prefix (R-24.5-d);
  - `result-type`     — additional `resultType` discriminator values (R-24.5-e);
  - `field`           — additional fields on existing objects (R-24.5-g).
