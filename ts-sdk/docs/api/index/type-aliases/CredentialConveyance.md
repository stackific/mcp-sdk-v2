[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CredentialConveyance

# Type Alias: CredentialConveyance

> **CredentialConveyance** = `"bearer"` \| `"environment"` \| `"best-practice"`

Defined in: [protocol/authorization.ts:93](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L93)

How a client conveys credentials for a given transport.

  - `http` → the OAuth 2.1 bearer-token flow of §23 (`bearer`).
  - `stdio` → out-of-band via the child-process `environment` (R-23.1-b).
  - `other` → that transport's own `best-practice` mechanism (R-23.1-c).
