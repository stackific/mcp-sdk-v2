[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / serverExposesTools

# Function: serverExposesTools()

> **serverExposesTools**(`serverCaps`): `boolean`

Defined in: [protocol/tools.ts:96](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L96)

Returns `true` when the server's capabilities declare the `tools` capability.
A server that exposes tools MUST declare it during version negotiation, and
presence of the object means supported. (§16.1, R-16.1-a; delegates to
S10 `serverDeclares(caps, 'tools')`.)

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
