[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SENSITIVE\_FIELD\_MARKERS

# Variable: SENSITIVE\_FIELD\_MARKERS

> `const` **SENSITIVE\_FIELD\_MARKERS**: readonly \[`"password"`, `"passwd"`, `"secret"`, `"api key"`, `"apikey"`, `"api-key"`, `"access token"`, `"access_token"`, `"accesstoken"`, `"token"`, `"credential"`, `"private key"`, `"card number"`, `"cardnumber"`, `"cvv"`, `"cvc"`, `"ssn"`, `"payment"`\]

Defined in: [protocol/elicitation-form.ts:1132](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1132)

Heuristic markers for sensitive credential fields a server MUST NOT request via
form mode (passwords, API keys, access tokens, payment credentials). Matched
against a lower-cased field name / `title` / `description`. (§20.7, R-20.7-h)

This is a best-effort guard, not an exhaustive list; servers remain responsible
for routing sensitive interactions to URL mode. (R-20.7-i)
