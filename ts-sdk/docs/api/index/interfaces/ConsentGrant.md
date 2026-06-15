[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ConsentGrant

# Interface: ConsentGrant

Defined in: [protocol/security.ts:312](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L312)

A record of the consent a user has explicitly granted for a single operation,
the host's consent-gate state. (§28.2) Absence of a record is NOT consent
(R-28.2-d); the scope captured here is what a later operation is compared
against for material change (R-28.2-e, R-28.2-f).

## Properties

### operation

> **operation**: `string`

Defined in: [protocol/security.ts:314](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L314)

The operation the user authorized, e.g. a tool name or `'resource-exposure'`.

***

### scope

> **scope**: `string`

Defined in: [protocol/security.ts:321](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L321)

An opaque, comparable summary of WHAT was authorized — the data scope and the
action. A materially different value on a later request means fresh consent is
required (R-28.2-e, R-28.2-f). Callers choose a stable serialization (e.g. the
sorted argument keys + sensitivity class).

***

### informed

> **informed**: `boolean`

Defined in: [protocol/security.ts:323](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L323)

`true` when the user actively, informedly granted it. Defaults to `false` if absent. (R-28.2-b)
