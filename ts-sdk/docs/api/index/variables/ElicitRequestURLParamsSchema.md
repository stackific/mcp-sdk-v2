[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitRequestURLParamsSchema

# Variable: ElicitRequestURLParamsSchema

> `const` **ElicitRequestURLParamsSchema**: `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"url"`\>; `message`: `ZodString`; `elicitationId`: `ZodString`; `url`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `mode`: `ZodLiteral`\<`"url"`\>; `message`: `ZodString`; `elicitationId`: `ZodString`; `url`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `mode`: `ZodLiteral`\<`"url"`\>; `message`: `ZodString`; `elicitationId`: `ZodString`; `url`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation.ts:183](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L183)

URL-mode parameters: out-of-band interaction by navigating to a URL; only the
URL is exposed to the client (suited to authorization / payment flows).
(§20.3)

  - `mode` REQUIRED; MUST be the literal `"url"`. (R-20.3-i)
  - `message` REQUIRED string explaining why the interaction is needed.
    (R-20.3-j)
  - `elicitationId` REQUIRED opaque string identifying the elicitation within
    the server's context; the client MUST treat it as opaque. (R-20.3-k,
    R-20.3-l)
  - `url` REQUIRED string the user navigates to; MUST be a valid URI / URL.
    (R-20.3-m, R-20.3-n) — enforced with Zod's `url()` refinement.
