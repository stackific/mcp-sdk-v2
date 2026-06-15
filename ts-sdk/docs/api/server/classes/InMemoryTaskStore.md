[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / InMemoryTaskStore

# Class: InMemoryTaskStore

Defined in: server/tasks.ts:47

A conformant, in-memory store for the Tasks extension (§25).

## Implements

- [`TaskStore`](../interfaces/TaskStore.md)

## Constructors

### Constructor

> **new InMemoryTaskStore**(`options?`): `InMemoryTaskStore`

Defined in: server/tasks.ts:53

#### Parameters

##### options?

[`InMemoryTaskStoreOptions`](../interfaces/InMemoryTaskStoreOptions.md) = `{}`

#### Returns

`InMemoryTaskStore`

## Methods

### createTask()

> **createTask**(`options?`): `objectOutputType`

Defined in: server/tasks.ts:61

Creates a task in the initial `working` state and returns the handle. (§25.3, §25.4)

#### Parameters

##### options?

###### ttlMs?

`number` \| `null`

###### taskId?

`string`

#### Returns

`objectOutputType`

***

### updateStatus()

> **updateStatus**(`taskId`, `status`, `statusMessage?`): `objectOutputType`

Defined in: server/tasks.ts:78

Transitions a task to `status`, enforcing the legal transition graph. (§25.5)

#### Parameters

##### taskId

`string`

##### status

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

##### statusMessage?

`string`

#### Returns

`objectOutputType`

***

### storeResult()

> **storeResult**(`taskId`, `result`, `status?`): `objectOutputType`

Defined in: server/tasks.ts:93

Stores the terminal payload and moves the task to a terminal status (default `completed`).

#### Parameters

##### taskId

`string`

##### result

`Record`\<`string`, `unknown`\>

##### status?

`"input_required"` \| `"cancelled"` \| `"completed"` \| `"working"` \| `"failed"`

#### Returns

`objectOutputType`

***

### get()

> **get**(`taskId`): `objectOutputType`

Defined in: server/tasks.ts:105

`tasks/get` — the current task handle, or `-32602` if unknown/expired. (§25.7)

#### Parameters

##### taskId

`string`

#### Returns

`objectOutputType`

#### Implementation of

[`TaskStore`](../interfaces/TaskStore.md).[`get`](../interfaces/TaskStore.md#get)

***

### getDetailed()

> **getDetailed**(`taskId`): `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>

Defined in: server/tasks.ts:115

The status-appropriate [DetailedTask](../../index/type-aliases/DetailedTask.md) the `tasks/get` result wraps
(§25.7): a terminal task carries its outcome INLINE — `result` when completed,
`error` when failed — `inputRequests` when input-required, and nothing extra
while working/cancelled. (R-25.5-d)

#### Parameters

##### taskId

`string`

#### Returns

`objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>

#### Implementation of

[`TaskStore`](../interfaces/TaskStore.md).[`getDetailed`](../interfaces/TaskStore.md#getdetailed)

***

### storeError()

> **storeError**(`taskId`, `error`): `objectOutputType`

Defined in: server/tasks.ts:143

Records an inline error and moves the task to `failed`. (§25.5)

#### Parameters

##### taskId

`string`

##### error

###### code

`number`

###### message

`string`

###### data?

`unknown`

#### Returns

`objectOutputType`

***

### applyInput()

> **applyInput**(`taskId`, `inputResponses`): `objectOutputType`

Defined in: server/tasks.ts:149

`tasks/update` — supplies input to an `input_required` task, moving it back to `working`. (§25.8)

#### Parameters

##### taskId

`string`

##### inputResponses

`Record`\<`string`, `unknown`\>

#### Returns

`objectOutputType`

#### Implementation of

[`TaskStore`](../interfaces/TaskStore.md).[`applyInput`](../interfaces/TaskStore.md#applyinput)

***

### getResult()

> **getResult**(`taskId`): `Record`\<`string`, `unknown`\>

Defined in: server/tasks.ts:159

`tasks/result` — terminal payload; `-32602` if unknown/expired or not finished. (§25.7)

#### Parameters

##### taskId

`string`

#### Returns

`Record`\<`string`, `unknown`\>

***

### list()

> **list**(): `objectOutputType`\<\{ `taskId`: `ZodString`; `status`: `ZodEnum`\<\[`"working"`, `"input_required"`, `"completed"`, `"failed"`, `"cancelled"`\]\>; `statusMessage`: `ZodOptional`\<`ZodString`\>; `createdAt`: `ZodString`; `lastUpdatedAt`: `ZodString`; `ttlMs`: `ZodUnion`\<\[`ZodNumber`, `ZodNull`\]\>; `pollIntervalMs`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>[]

Defined in: server/tasks.ts:168

`tasks/list` — all live tasks (expired ones are discarded first).

#### Returns

`objectOutputType`\<\{ `taskId`: `ZodString`; `status`: `ZodEnum`\<\[`"working"`, `"input_required"`, `"completed"`, `"failed"`, `"cancelled"`\]\>; `statusMessage`: `ZodOptional`\<`ZodString`\>; `createdAt`: `ZodString`; `lastUpdatedAt`: `ZodString`; `ttlMs`: `ZodUnion`\<\[`ZodNumber`, `ZodNull`\]\>; `pollIntervalMs`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>[]

***

### cancel()

> **cancel**(`taskId`): `objectOutputType`

Defined in: server/tasks.ts:174

`tasks/cancel` — move a non-terminal task to `cancelled`; terminal tasks are returned unchanged. (§25.9)

#### Parameters

##### taskId

`string`

#### Returns

`objectOutputType`

#### Implementation of

[`TaskStore`](../interfaces/TaskStore.md).[`cancel`](../interfaces/TaskStore.md#cancel)
