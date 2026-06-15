[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StepUpPlan

# Interface: StepUpPlan

Defined in: [protocol/authorization-registration.ts:915](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L915)

A plan for one step-up re-authorization, from [planStepUpAuthorization](../functions/planStepUpAuthorization.md).

## Properties

### proceed

> **proceed**: `boolean`

Defined in: [protocol/authorization-registration.ts:917](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L917)

Whether a step-up should be attempted at all (per the actor and retry bound).

***

### scopes

> **scopes**: `string`[]

Defined in: [protocol/authorization-registration.ts:919](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L919)

The UNION scope set to request on re-authorization, when `proceed`. (R-23.18-o)

***

### scope

> **scope**: `string`

Defined in: [protocol/authorization-registration.ts:921](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L921)

The space-delimited `scope` parameter for the re-authorization request.

***

### reason?

> `optional` **reason?**: `string`

Defined in: [protocol/authorization-registration.ts:923](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L923)

When `proceed` is `false`, why the step-up is not attempted.
