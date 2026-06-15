[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ClientIdMechanism

# Type Alias: ClientIdMechanism

> **ClientIdMechanism** = `"pre-registration"` \| `"cimd"` \| `"dcr"` \| `"prompt"`

Defined in: [protocol/authorization-flow.ts:214](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L214)

The ways a client obtains a `client_id`, plus the user-prompt fallback. (R-23.4-a)

  - `pre-registration` — credentials provisioned out of band ahead of time.
  - `cimd` — a Client ID Metadata Document HTTPS URL used directly as `client_id`.
  - `dcr` — Dynamic Client Registration (Deprecated) at a `registration_endpoint`.
  - `prompt` — fall back to prompting the user.
