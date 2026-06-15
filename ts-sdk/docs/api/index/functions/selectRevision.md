[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / selectRevision

# Function: selectRevision()

> **selectRevision**(`supportedVersions`, `clientAcceptable?`): `string` \| `undefined`

Defined in: [protocol/discovery.ts:443](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L443)

Selects a protocol revision from a server's `supportedVersions` using the
client's own preference order — never the order of the server's array.
(R-5.3.2-d, AC-08.7)

The client supplies `clientAcceptable`, its revisions in descending preference.
The first client-preferred revision that the server also supports is chosen.
Because the decision is driven by the client's order and by set membership of
the server's list, **reordering `supportedVersions` cannot change the result**.

Returns `undefined` when the client and server share no revision (the caller
then has no usable revision — selection makes no fallback assumption).

## Parameters

### supportedVersions

readonly `string`[]

The server's advertised revisions (order ignored).

### clientAcceptable?

readonly `string`[] = `...`

The client's acceptable revisions, most-preferred first.
  Defaults to `[CURRENT_PROTOCOL_VERSION]`.

## Returns

`string` \| `undefined`
