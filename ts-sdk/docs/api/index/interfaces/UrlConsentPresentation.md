[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UrlConsentPresentation

# Interface: UrlConsentPresentation

Defined in: [protocol/elicitation-form.ts:1308](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1308)

What a client must surface to the user before consenting to open a URL. (§20.7)

## Properties

### fullUrl

> **fullUrl**: `string`

Defined in: [protocol/elicitation-form.ts:1310](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1310)

The full URL shown verbatim for examination. (R-20.7-v)

***

### host

> **host**: `string`

Defined in: [protocol/elicitation-form.ts:1312](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1312)

The host to highlight (mitigates subdomain spoofing). (R-20.7-v, R-20.7-x)

***

### domain

> **domain**: `string`

Defined in: [protocol/elicitation-form.ts:1314](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1314)

The registrable-ish domain portion highlighted to the user. (R-20.7-x)

***

### scheme

> **scheme**: `string`

Defined in: [protocol/elicitation-form.ts:1316](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1316)

The URL scheme.

***

### containsPunycode

> **containsPunycode**: `boolean`

Defined in: [protocol/elicitation-form.ts:1318](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1318)

`true` when the host contains Punycode (`xn--`) — warn the user. (R-20.7-x)

***

### warnings

> **warnings**: `string`[]

Defined in: [protocol/elicitation-form.ts:1320](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1320)

Warnings to display about ambiguous/suspicious aspects of the URL. (R-20.7-x)
