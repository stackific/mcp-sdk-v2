[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RobustnessDisposition

# Type Alias: RobustnessDisposition

> **RobustnessDisposition** = `"accept"` \| `"ignore"` \| `"treat-as-error"` \| `"fail-request"`

Defined in: [protocol/conformance-requirements.ts:666](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L666)

How a conformant receiver disposes of an element of a received message under
the §29.6 robustness rules. (§29.6)

  - `accept`         — a recognized, understood element: process it normally;
  - `ignore`         — an unrecognized field/capability/extension: ignore it,
                       do NOT reject the message (R-29.6-b/c/d);
  - `treat-as-error` — an unrecognized resultType: the whole response is an
                       error and MUST NOT be acted upon (R-29.6-f/g);
  - `fail-request`   — an unrecognized error code: a request failure surfaced
                       via message/data, never a crash/misclassification (R-29.6-e).
