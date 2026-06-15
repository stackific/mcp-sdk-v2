[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DeprecatedRegistryEntry

# Interface: DeprecatedRegistryEntry

Defined in: [lifecycle/state.ts:52](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L52)

One row of the derived registry of deprecated features (§27.3).
The per-feature notices at the authoritative defining sections resolve conflicts.

## Properties

### feature

> **feature**: `string`

Defined in: [lifecycle/state.ts:54](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L54)

Name of the deprecated feature.

***

### definedIn

> **definedIn**: `string`

Defined in: [lifecycle/state.ts:56](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L56)

Section reference where the feature is authoritatively defined.

***

### migrationNote

> **migrationNote**: `string`

Defined in: [lifecycle/state.ts:58](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L58)

One-line migration guidance. (R-27.2-g)

***

### earliestRemoval

> **earliestRemoval**: `string`

Defined in: [lifecycle/state.ts:60](https://github.com/stackific/mcp-sdk-node/blob/main/src/lifecycle/state.ts#L60)

Protocol revision on or after which removal is eligible.
