[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / TaskStore

# Interface: TaskStore

Defined in: server/server.ts:82

The minimal task store the dispatcher needs for the Tasks extension (§25).

## Methods

### get()

> **get**(`taskId`): `object`

Defined in: server/server.ts:83

#### Parameters

##### taskId

`string`

#### Returns

`object`

##### status

> **status**: `string`

***

### getDetailed()

> **getDetailed**(`taskId`): `Record`\<`string`, `unknown`\>

Defined in: server/server.ts:85

The status-appropriate DetailedTask (status + inline result/error/inputRequests). (§25.7)

#### Parameters

##### taskId

`string`

#### Returns

`Record`\<`string`, `unknown`\>

***

### cancel()

> **cancel**(`taskId`): `object`

Defined in: server/server.ts:86

#### Parameters

##### taskId

`string`

#### Returns

`object`

##### status

> **status**: `string`

***

### applyInput()

> **applyInput**(`taskId`, `inputResponses`): `unknown`

Defined in: server/server.ts:88

Supplies input to an input_required task. (§25.8)

#### Parameters

##### taskId

`string`

##### inputResponses

`Record`\<`string`, `unknown`\>

#### Returns

`unknown`
