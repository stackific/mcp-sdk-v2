[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StepUpActor

# Type Alias: StepUpActor

> **StepUpActor** = `"user"` \| `"client_credentials"`

Defined in: [protocol/authorization-registration.ts:808](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L808)

Who the client is acting for, governing whether a step-up flow is attempted.
(R-23.18-m, R-23.18-n)

  - `user` — acting on behalf of a user; SHOULD attempt step-up (R-23.18-m).
  - `client_credentials` — acting on its own behalf; MAY attempt or abort (R-23.18-n).
