[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / ToolContext

# Interface: ToolContext

Defined in: server/server.ts:92

The ergonomic context passed to every tool handler.

## Properties

### meta

> **meta**: `Record`\<`string`, `unknown`\>

Defined in: server/server.ts:93

***

### signal

> **signal**: `AbortSignal`

Defined in: server/server.ts:94

***

### authInfo?

> `optional` **authInfo?**: `unknown`

Defined in: server/server.ts:95

***

### progressToken?

> `optional` **progressToken?**: `string` \| `number`

Defined in: server/server.ts:96

***

### taskRequested

> **taskRequested**: `boolean`

Defined in: server/server.ts:98

Whether the caller's params requested this call run as a task.

***

### taskTtlMs?

> `optional` **taskTtlMs?**: `number`

Defined in: server/server.ts:99

## Methods

### log()

> **log**(`level`, `message`): `void`

Defined in: server/server.ts:101

Emits a `notifications/message` at or above the server's current log level.

#### Parameters

##### level

`string`

##### message

`string`

#### Returns

`void`

***

### notify()

> **notify**(`notification`): `void`

Defined in: server/server.ts:102

#### Parameters

##### notification

###### method

`string`

###### params?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### elicitInput()

> **elicitInput**(`params`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: server/server.ts:104

Solicits structured input from the user (server→client `elicitation/create`).

#### Parameters

##### params

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### createMessage()

> **createMessage**(`params`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: server/server.ts:106

Borrows the client's model (server→client `sampling/createMessage`, Deprecated).

#### Parameters

##### params

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### listRoots()

> **listRoots**(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: server/server.ts:108

Requests the client's workspace roots (server→client `roots/list`, Deprecated).

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### sendToolListChanged()

> **sendToolListChanged**(): `void`

Defined in: server/server.ts:109

#### Returns

`void`

***

### sendPromptListChanged()

> **sendPromptListChanged**(): `void`

Defined in: server/server.ts:110

#### Returns

`void`

***

### sendResourceListChanged()

> **sendResourceListChanged**(): `void`

Defined in: server/server.ts:111

#### Returns

`void`

***

### sendResourceUpdated()

> **sendResourceUpdated**(`params`): `void`

Defined in: server/server.ts:112

#### Parameters

##### params

###### uri

`string`

#### Returns

`void`

***

### notifySubscribers()

> **notifySubscribers**(`notification`): `void`

Defined in: server/server.ts:114

Broadcasts a change notification to all matching subscription streams (§10.5/§10.6).

#### Parameters

##### notification

###### method

`string`

###### params?

`Record`\<`string`, `unknown`\>

#### Returns

`void`
