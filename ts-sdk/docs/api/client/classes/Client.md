[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / Client

# Class: Client

Defined in: client/client.ts:137

Client runtime — the high-level, edge-friendly client host and the Streamable
HTTP client transport, built on the SDK's protocol primitives.

This module imports no `node:*` and uses only Web-platform APIs, so it can be
imported on Cloudflare Workers / Deno / browsers as well as Node. Import it via
the package's `./client` subpath to keep the Node-only stdio transport (which
the package root re-exports) out of an edge bundle.

## Constructors

### Constructor

> **new Client**(`clientInfo`, `options?`): `Client`

Defined in: client/client.ts:156

#### Parameters

##### clientInfo

`objectOutputType`

This client's `Implementation` identity, stamped into every request's `_meta` (§4.3).

##### options?

[`ClientOptions`](../interfaces/ClientOptions.md) = `{}`

Declared capabilities and acceptable protocol revisions.

#### Returns

`Client`

## Properties

### clientInfo

> `readonly` **clientInfo**: `objectOutputType`

Defined in: client/client.ts:158

This client's `Implementation` identity, stamped into every request's `_meta` (§4.3).

***

### options

> `readonly` **options**: [`ClientOptions`](../interfaces/ClientOptions.md) = `{}`

Defined in: client/client.ts:160

Declared capabilities and acceptable protocol revisions.

## Accessors

### capabilities

#### Get Signature

> **get** **capabilities**(): `Record`\<`string`, `unknown`\>

Defined in: client/client.ts:169

The capabilities declared in every request envelope.

##### Returns

`Record`\<`string`, `unknown`\>

## Methods

### connect()

> **connect**(`transport`): `void`

Defined in: client/client.ts:179

Binds a transport and starts routing inbound frames. Lightweight and
synchronous — it performs no handshake (the 2026-07-28 model has none); call
[discover](#discover) to learn server identity/capabilities and the negotiated
revision.

#### Parameters

##### transport

[`Transport`](../../index/interfaces/Transport.md)

#### Returns

`void`

***

### close()

> **close**(): `Promise`\<`void`\>

Defined in: client/client.ts:193

Tears down handlers, fails any outstanding requests, and closes the transport.

#### Returns

`Promise`\<`void`\>

***

### setRequestHandler()

> **setRequestHandler**(`method`, `handler`): `void`

Defined in: client/client.ts:210

Registers the handler for an inbound server→client request `method`.

#### Parameters

##### method

`string`

##### handler

[`RequestHandler`](../type-aliases/RequestHandler.md)

#### Returns

`void`

***

### removeRequestHandler()

> **removeRequestHandler**(`method`): `void`

Defined in: client/client.ts:214

#### Parameters

##### method

`string`

#### Returns

`void`

***

### setNotificationHandler()

> **setNotificationHandler**(`method`, `handler`): `void`

Defined in: client/client.ts:219

Registers the handler for an inbound notification `method`.

#### Parameters

##### method

`string`

##### handler

[`NotificationHandler`](../type-aliases/NotificationHandler.md)

#### Returns

`void`

***

### removeNotificationHandler()

> **removeNotificationHandler**(`method`): `void`

Defined in: client/client.ts:223

#### Parameters

##### method

`string`

#### Returns

`void`

***

### getServerVersion()

> **getServerVersion**(): `objectOutputType`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[..., ...\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[..., ...\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `null`

Defined in: client/client.ts:230

The server's `Implementation` identity from the last [discover](#discover), or `null`.

#### Returns

`objectOutputType`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[`"light"`, `"dark"`\]\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[..., ...\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<\[..., ...\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `null`

***

### getServerCapabilities()

> **getServerCapabilities**(): `Record`\<`string`, `unknown`\> \| `null`

Defined in: client/client.ts:235

The server's advertised capabilities from the last [discover](#discover), or `null`.

#### Returns

`Record`\<`string`, `unknown`\> \| `null`

***

### getNegotiatedVersion()

> **getNegotiatedVersion**(): `string` \| `null`

Defined in: client/client.ts:240

The negotiated protocol revision, or `null` before a successful [discover](#discover).

#### Returns

`string` \| `null`

***

### getInstructions()

> **getInstructions**(): `string` \| `null`

Defined in: client/client.ts:245

The server's free-text usage instructions from the last [discover](#discover), or `null`.

#### Returns

`string` \| `null`

***

### protocolVersion()

> **protocolVersion**(): `string`

Defined in: client/client.ts:250

The protocol revision placed in outgoing `_meta`: negotiated, else most-preferred.

#### Returns

`string`

***

### discover()

> **discover**(): `Promise`\<`objectOutputType`\<\{ `resultType`: `ZodString`; `supportedVersions`: `ZodArray`\<`ZodString`, `"many"`\>; `capabilities`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; `serverInfo`: `ZodObject`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<..., ...\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `instructions`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: client/client.ts:262

Calls `server/discover`, caches the server identity/capabilities/instructions,
and selects the highest mutually supported revision via [negotiateRevision](../../index/functions/negotiateRevision.md).
Returns the raw `DiscoverResult`. Throws [RequestError](RequestError.md) if the server
rejects discovery (e.g. an older server that lacks the method).

#### Returns

`Promise`\<`objectOutputType`\<\{ `resultType`: `ZodString`; `supportedVersions`: `ZodArray`\<`ZodString`, `"many"`\>; `capabilities`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; `serverInfo`: `ZodObject`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<`ZodString`\>; `sizes`: `ZodOptional`\<`ZodArray`\<..., ...\>\>; `theme`: `ZodOptional`\<`ZodEnum`\<...\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; `icons`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `src`: `ZodString`; `mimeType`: `ZodOptional`\<...\>; `sizes`: `ZodOptional`\<...\>; `theme`: `ZodOptional`\<...\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `src`: ...; `mimeType`: ...; `sizes`: ...; `theme`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>\>; `version`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `websiteUrl`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `instructions`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

***

### request()

> **request**(`req`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:290

Sends a JSON-RPC request, attaching the required `_meta` envelope, and
resolves with the `result`. Rejects with [RequestError](RequestError.md) for a delivered
error response, or [TransportError](../../index/classes/TransportError.md) for a channel failure / cancellation.

#### Parameters

##### req

###### method

`string`

###### params?

`Record`\<`string`, `unknown`\>

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### callTool()

> **callTool**(`params`, `options?`): `Promise`\<`objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `content`: `ZodArray`\<`ZodUnion`\<\[`ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `"many"`\>; `structuredContent`: `ZodOptional`\<`ZodUnknown`\>; `isError`: `ZodOptional`\<`ZodBoolean`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: client/client.ts:321

Convenience wrapper for `tools/call`; returns the typed [CallToolResult](../../index/type-aliases/CallToolResult.md). (§16.5)

#### Parameters

##### params

###### name

`string`

###### arguments?

`Record`\<`string`, `unknown`\>

###### _meta?

`Record`\<`string`, `unknown`\>

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `content`: `ZodArray`\<`ZodUnion`\<\[`ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"text"`\>; `text`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"image"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<\{ `audience`: ...; `priority`: ...; `lastModified`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: `ZodOptional`\<`ZodObject`\<..., ..., ..., ..., ...\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<..., ...\>\>; `type`: `ZodLiteral`\<`"audio"`\>; `data`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `mimeType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>, `"many"`\>; `structuredContent`: `ZodOptional`\<`ZodUnknown`\>; `isError`: `ZodOptional`\<`ZodBoolean`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

***

### notify()

> **notify**(`method`, `params?`): `Promise`\<`void`\>

Defined in: client/client.ts:334

Sends a one-way notification.

#### Parameters

##### method

`string`

##### params?

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`void`\>

***

### ping()

> **ping**(`options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:343

`ping` — a no-op round-trip to check liveness.

#### Parameters

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### listTools()

> **listTools**(`cursor?`, `options?`): `Promise`\<`objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `tools`: `ZodArray`\<`ZodEffects`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: client/client.ts:348

`tools/list` — one page of tools (pass a cursor, or use [listAllTools](#listalltools)). (§16.2)

#### Parameters

##### cursor?

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `tools`: `ZodArray`\<`ZodEffects`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

***

### listResources()

> **listResources**(`cursor?`, `options?`): `Promise`\<`object` & `object` & `object` & `object`\>

Defined in: client/client.ts:359

`resources/list` — one page of resources. (§17.2)

#### Parameters

##### cursor?

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`object` & `object` & `object` & `object`\>

***

### listResourceTemplates()

> **listResourceTemplates**(`cursor?`, `options?`): `Promise`\<`object` & `object` & `object` & `object`\>

Defined in: client/client.ts:364

`resources/templates/list` — one page of resource templates. (§17.3)

#### Parameters

##### cursor?

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`object` & `object` & `object` & `object`\>

***

### readResource()

> **readResource**(`uri`, `options?`): `Promise`\<`object` & `object` & `object`\>

Defined in: client/client.ts:369

`resources/read` — read a resource by URI. (§17.5)

#### Parameters

##### uri

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`object` & `object` & `object`\>

***

### listPrompts()

> **listPrompts**(`cursor?`, `options?`): `Promise`\<`objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `prompts`: `ZodArray`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: client/client.ts:374

`prompts/list` — one page of prompts. (§18.2)

#### Parameters

##### cursor?

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"complete"`\>; `prompts`: `ZodArray`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `nextCursor`: `ZodOptional`\<`ZodString`\>; `ttlMs`: `ZodNumber`; `cacheScope`: `ZodEnum`\<\[`"public"`, `"private"`\]\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

***

### getPrompt()

> **getPrompt**(`name`, `args?`, `options?`): `Promise`\<`objectOutputType`\<\{ `resultType`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `messages`: `ZodArray`\<`ZodObject`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\]\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\]\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: client/client.ts:379

`prompts/get` — resolve a prompt with arguments. (§18.4)

#### Parameters

##### name

`string`

##### args?

`Record`\<`string`, `string`\>

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`objectOutputType`\<\{ `resultType`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `messages`: `ZodArray`\<`ZodObject`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `text`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `annotations`: `ZodOptional`\<...\>; `_meta`: `ZodOptional`\<...\>; `type`: `ZodLiteral`\<...\>; `data`: `ZodEffects`\<..., ..., ...\>; `mimeType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\]\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `role`: `ZodEnum`\<\[`"user"`, `"assistant"`\]\>; `content`: `ZodUnion`\<\[`ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `text`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>, `ZodObject`\<\{ `annotations`: ...; `_meta`: ...; `type`: ...; `data`: ...; `mimeType`: ...; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<..., ..., ...\>, `objectInputType`\<..., ..., ...\>\>\]\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

***

### complete()

> **complete**(`ref`, `argument`, `context?`, `options?`): `Promise`\<`objectOutputType`\<\{ `resultType`: `ZodString`; `completion`: `ZodObject`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: client/client.ts:384

`completion/complete` — argument autocompletion. (§19.2)

#### Parameters

##### ref

`unknown`

##### argument

`unknown`

##### context?

`unknown`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`objectOutputType`\<\{ `resultType`: `ZodString`; `completion`: `ZodObject`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

***

### setLoggingLevel()

> **setLoggingLevel**(`level`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:389

`logging/setLevel` — set the minimum log severity the server should emit. (§15.3, Deprecated)

#### Parameters

##### level

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### paginate()

> **paginate**\<`T`\>(`method`, `itemsKey`, `options?`): `AsyncGenerator`\<`T`\>

Defined in: client/client.ts:402

Lazily iterates every item of a paginated list method, following `nextCursor`
until the server stops returning one. (§12.3)

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### method

`string`

The paginated list method (e.g. `'tools/list'`).

##### itemsKey

`string`

The result key holding the page array (e.g. `'tools'`).

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`AsyncGenerator`\<`T`\>

***

### listAllTools()

> **listAllTools**(`options?`): `AsyncGenerator`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:416

Iterates all tools across pages. (§16.2)

#### Parameters

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`AsyncGenerator`\<`Record`\<`string`, `unknown`\>\>

***

### listAllResources()

> **listAllResources**(`options?`): `AsyncGenerator`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:420

Iterates all resources across pages. (§17.2)

#### Parameters

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`AsyncGenerator`\<`Record`\<`string`, `unknown`\>\>

***

### listAllPrompts()

> **listAllPrompts**(`options?`): `AsyncGenerator`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:424

Iterates all prompts across pages. (§18.2)

#### Parameters

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`AsyncGenerator`\<`Record`\<`string`, `unknown`\>\>

***

### serverSupports()

> **serverSupports**(`capability`): `boolean`

Defined in: client/client.ts:431

Returns `true` when the last [discover](#discover) advertised the named server capability.

#### Parameters

##### capability

`string`

#### Returns

`boolean`

***

### assertServerCapability()

> **assertServerCapability**(`capability`): `void`

Defined in: client/client.ts:437

Throws unless the server advertised `capability` — fail fast before a round-trip. (§6.4)

#### Parameters

##### capability

`string`

#### Returns

`void`

***

### createTask()

> **createTask**(`name`, `args?`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:446

Augmented `tools/call` that runs as a task and returns a task handle. (§25.3)

#### Parameters

##### name

`string`

##### args?

`Record`\<`string`, `unknown`\>

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md) & `object`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### getTask()

> **getTask**(`taskId`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:460

`tasks/get` — the task's current `DetailedTask` (status plus the inline outcome
once terminal: `result` when completed, `error` when failed). There is no
separate `tasks/result` in this revision — the payload is carried here. (§25.7)

#### Parameters

##### taskId

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### updateTask()

> **updateTask**(`taskId`, `inputResponses`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:464

`tasks/update` — supply input to an `input_required` task. (§25.8)

#### Parameters

##### taskId

`string`

##### inputResponses

`Record`\<`string`, `unknown`\>

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### cancelTask()

> **cancelTask**(`taskId`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:472

`tasks/cancel` — request cancellation of a task. (§25.9)

#### Parameters

##### taskId

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### pollTaskUntilTerminal()

> **pollTaskUntilTerminal**(`taskId`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:481

Polls `tasks/get` until the task reaches a terminal status
(`completed`/`failed`/`cancelled`), then returns the final task object.
(§25.5) Honors `signal` and an overall `timeoutMs`.

#### Parameters

##### taskId

`string`

##### options?

###### intervalMs?

`number`

###### timeoutMs?

`number`

###### signal?

`AbortSignal`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### requestWithInput()

> **requestWithInput**(`req`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: client/client.ts:506

Runs a participating request (`tools/call`/`prompts/get`/`resources/read`) to
completion, fulfilling any `input_required` results in a loop: each requested
input kind is satisfied by the matching handler registered via
[setRequestHandler](#setrequesthandler), then the request is retried with `inputResponses` +
the echoed `requestState`, bounded by a round guard. (§11.5)

#### Parameters

##### req

###### method

`string`

###### params?

`Record`\<`string`, `unknown`\>

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md) & `object`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

***

### subscribe()

> **subscribe**(`filter`, `onNotification`, `_options?`): `Promise`\<[`SubscriptionHandle`](../interfaces/SubscriptionHandle.md)\>

Defined in: client/client.ts:549

Opens a subscription via `subscriptions/listen`, routing the honored change
notifications to `onNotification`. Resolves once the server acknowledges the
honored subset; the returned handle's `closed` resolves at teardown. (§10)

#### Parameters

##### filter

`objectOutputType`

##### onNotification

(`method`, `params`) => `void`

##### \_options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`SubscriptionHandle`](../interfaces/SubscriptionHandle.md)\>
