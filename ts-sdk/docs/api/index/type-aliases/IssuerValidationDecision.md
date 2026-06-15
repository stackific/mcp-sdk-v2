[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / IssuerValidationDecision

# Type Alias: IssuerValidationDecision

> **IssuerValidationDecision** = `"compare"` \| `"reject"` \| `"proceed"`

Defined in: [protocol/authorization-flow.ts:993](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L993)

The four rows of the §23.7 issuer-validation decision table. (R-23.7-d)

  - `compare` — `iss` is present; compare it to the recorded issuer.
  - `reject` — `iss` is absent though advertised as supported; reject.
  - `proceed` — `iss` is absent and not advertised; proceed without comparison.
