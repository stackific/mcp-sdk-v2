[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PostFallbackDecision

# Type Alias: PostFallbackDecision

> **PostFallbackDecision** = \{ `action`: `"retry"`; `supported?`: `string`[]; \} \| \{ `action`: `"proceed"`; \} \| \{ `action`: `"legacy-probe"`; \}

Defined in: [transport/http/responses.ts:587](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L587)

The decision a dual-revision client makes after a modern POST. (§9.12)

  - `retry`    — the body is a recognized error of this revision; the client
    MUST retry (using `error.data.supported` if present) and MUST NOT fall
    back to `initialize`. (R-9.12-c, R-9.12-d)
  - `proceed`  — a non-`400` success/continuation; nothing to fall back from.
  - `legacy-probe` — the status is `400`/`404`/`405` and the body is not a
    recognized revision error; the client SHOULD issue a `GET` to detect the
    deprecated HTTP+SSE transport. (R-9.12-b, R-9.12-e, R-9.12-g)
