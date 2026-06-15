[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / McpServer

# Class: McpServer

Defined in: server/server.ts:203

Server runtime — an embeddable, edge-friendly MCP server: the `McpServer`
dispatcher + registration API, a Web-standard Streamable HTTP request handler,
and a Hono adapter.

This barrel imports no `node:*` and uses only Web-platform APIs, so it can be
imported on Cloudflare Workers / Deno / Bun as well as Node. Import it via the
package's `./server` subpath. The Node (`node:http`) adapter is kept separate
under `./server/node` so it never enters an edge bundle.

## Constructors

### Constructor

> **new McpServer**(`info`, `capabilities?`, `options?`): `McpServer`

Defined in: server/server.ts:214

#### Parameters

##### info

`objectOutputType`

##### capabilities?

`Record`\<`string`, `unknown`\> = `{}`

##### options?

[`McpServerOptions`](../interfaces/McpServerOptions.md) = `{}`

#### Returns

`McpServer`

## Properties

### info

> `readonly` **info**: `objectOutputType`

Defined in: server/server.ts:215

***

### capabilities

> `readonly` **capabilities**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: server/server.ts:216

## Accessors

### minLogLevel

#### Get Signature

> **get** **minLogLevel**(): `string`

Defined in: server/server.ts:278

##### Returns

`string`

## Methods

### setTaskStore()

> **setTaskStore**(`store`): `void`

Defined in: server/server.ts:259

#### Parameters

##### store

[`TaskStore`](../interfaces/TaskStore.md)

#### Returns

`void`

***

### registerTool()

> **registerTool**(`name`, `def`, `handler`): `void`

Defined in: server/server.ts:263

#### Parameters

##### name

`string`

##### def

[`ToolDef`](../interfaces/ToolDef.md)

##### handler

[`ToolHandler`](../type-aliases/ToolHandler.md)

#### Returns

`void`

***

### registerResource()

> **registerResource**(`name`, `uri`, `def`, `read`): `void`

Defined in: server/server.ts:266

#### Parameters

##### name

`string`

##### uri

`string`

##### def

[`ResourceDef`](../interfaces/ResourceDef.md)

##### read

[`ResourceReader`](../type-aliases/ResourceReader.md)

#### Returns

`void`

***

### registerResourceTemplate()

> **registerResourceTemplate**(`name`, `def`, `read`): `void`

Defined in: server/server.ts:269

#### Parameters

##### name

`string`

##### def

[`ResourceTemplateDef`](../interfaces/ResourceTemplateDef.md)

##### read

[`TemplateReader`](../type-aliases/TemplateReader.md)

#### Returns

`void`

***

### registerPrompt()

> **registerPrompt**(`name`, `def`, `handler`): `void`

Defined in: server/server.ts:272

#### Parameters

##### name

`string`

##### def

[`PromptDef`](../interfaces/PromptDef.md)

##### handler

[`PromptHandler`](../type-aliases/PromptHandler.md)

#### Returns

`void`

***

### hasTool()

> **hasTool**(`name`): `boolean`

Defined in: server/server.ts:275

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### dispatch()

> **dispatch**(`method`, `params`, `ctx`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: server/server.ts:283

Routes one JSON-RPC request to its handler, returning the `result` payload.

#### Parameters

##### method

`string`

##### params

`Record`\<`string`, `unknown`\>

##### ctx

[`RequestContext`](../interfaces/RequestContext.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>
