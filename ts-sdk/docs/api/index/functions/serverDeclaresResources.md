[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / serverDeclaresResources

# Function: serverDeclaresResources()

> **serverDeclaresResources**(`serverCaps`): `boolean`

Defined in: [protocol/resources.ts:105](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L105)

Returns `true` when the server has declared the `resources` capability (object
presence). Reuses [serverDeclares](serverDeclares.md); only when this is `true` may a server
accept `resources/list`, `resources/templates/list`, or `resources/read`, and a
client issue them. (§17.1, R-17.1-h, R-17.1-j)

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
