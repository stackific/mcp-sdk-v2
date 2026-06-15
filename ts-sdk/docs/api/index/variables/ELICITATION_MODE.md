[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ELICITATION\_MODE

# Variable: ELICITATION\_MODE

> `const` **ELICITATION\_MODE**: `object`

Defined in: [protocol/elicitation.ts:70](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L70)

The two elicitation modes, selected by the `mode` discriminator in `params`.
(§20.3)

  `"form"` — in-band structured collection; the collected data IS exposed to
             the client. It is the implicit baseline (a `params` with no
             `mode` is form mode). (R-20.3-a, R-20.3-c)
  `"url"`  — out-of-band navigation; data other than the URL is NOT exposed
             to the client (suited to authorization / payment flows), gated by
             the `elicitation.url` sub-flag. (R-20.3-i, R-20.1-d)

## Type Declaration

### FORM

> `readonly` **FORM**: `"form"` = `'form'`

### URL

> `readonly` **URL**: `"url"` = `'url'`
