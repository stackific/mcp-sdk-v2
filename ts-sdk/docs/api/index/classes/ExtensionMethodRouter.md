[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionMethodRouter

# Class: ExtensionMethodRouter

Defined in: [protocol/extension-mechanism.ts:759](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L759)

Routes extension-defined methods to their handlers, enforcing the two
framework rules that govern dispatch:
  - method strings are namespaced under the registering extension (R-24.5-b);
  - a handler is invoked ONLY when its extension is in the active set for the
    interaction (R-24.5-c) — a non-active extension's method is never run.

Registration validates the namespace eagerly so a misnamed method is rejected
at wiring time, not silently at dispatch. The router holds no per-connection
state; the active set is supplied per dispatch, honoring the stateless model
(§24.4).

## Constructors

### Constructor

> **new ExtensionMethodRouter**(): `ExtensionMethodRouter`

#### Returns

`ExtensionMethodRouter`

## Methods

### register()

> **register**(`identifier`, `method`, `handler`): `this`

Defined in: [protocol/extension-mechanism.ts:770](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L770)

Registers `handler` for an extension-defined `method`. The method MUST be in
`identifier`'s derived namespace (R-24.5-b) and MUST NOT already be
registered (no redefinition, R-24.5-i).

#### Parameters

##### identifier

`string`

##### method

`string`

##### handler

[`ExtensionMethodHandler`](../type-aliases/ExtensionMethodHandler.md)

#### Returns

`this`

#### Throws

when the method is not namespaced under `identifier` or
  the method string is already registered.

***

### has()

> **has**(`method`): `boolean`

Defined in: [protocol/extension-mechanism.ts:784](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L784)

Returns `true` when `method` has a registered handler.

#### Parameters

##### method

`string`

#### Returns

`boolean`

***

### ownerOf()

> **ownerOf**(`method`): `string` \| `undefined`

Defined in: [protocol/extension-mechanism.ts:789](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L789)

Returns the extension identifier that owns `method`, or `undefined`.

#### Parameters

##### method

`string`

#### Returns

`string` \| `undefined`

***

### dispatch()

> **dispatch**(`method`, `params`, `activeSet`): [`ExtensionDispatchOutcome`](../type-aliases/ExtensionDispatchOutcome.md)

Defined in: [protocol/extension-mechanism.ts:806](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L806)

Dispatches `method` with `params`, but only when the owning extension is in
`activeSet`. (R-24.5-c)

  - unknown method            → `{ ok: false, reason: 'unknown-method' }`;
  - owning extension inactive → `{ ok: false, reason: 'extension-inactive' }`
    (the method is NOT invoked — a non-active extension's surface is ignored);
  - otherwise                 → `{ ok: true, result }` from the handler.

Both rejections carry `INVALID_PARAMS_CODE` so a caller can convert the
outcome into a core error response when it chooses to reject rather than
ignore (R-24.3-f).

#### Parameters

##### method

`string`

##### params

`unknown`

##### activeSet

`Iterable`\<`string`\>

#### Returns

[`ExtensionDispatchOutcome`](../type-aliases/ExtensionDispatchOutcome.md)
