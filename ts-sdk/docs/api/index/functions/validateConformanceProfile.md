[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateConformanceProfile

# Function: validateConformanceProfile()

> **validateConformanceProfile**(`profile`): [`ConformanceProfileValidation`](../type-aliases/ConformanceProfileValidation.md)

Defined in: [protocol/conformance-requirements.ts:875](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L875)

Validates that a [ConformanceProfile](../interfaces/ConformanceProfile.md) is well-formed against the
structural requirements of §29. (§29.5 item 2, §29.8 item 1, §29.9 item 3,
R-29.1-b, R-29.5-c, R-29.8-a, R-29.9-c) Accumulates ALL violations:

  - `roles`      — at least one, each a recognized role (R-29.1-a/b);
  - `revisions`  — non-empty and MUST include `2026-07-28` (R-29.9-c);
  - `extensions` — every identifier well-formed per §6 naming (R-29.5-c);
    an empty list is fully conformant (R-29.5-a);
  - `transports` — at least one transport (R-29.8-a).

`capabilities` are not constrained here beyond being a list — an unrecognized
capability is tolerated by robustness (R-29.6-c), not a profile error.

## Parameters

### profile

[`ConformanceProfile`](../interfaces/ConformanceProfile.md)

## Returns

[`ConformanceProfileValidation`](../type-aliases/ConformanceProfileValidation.md)
