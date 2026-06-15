[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateDiscoverRequest

# Function: validateDiscoverRequest()

> **validateDiscoverRequest**(`request`): [`DiscoverRequestValidation`](../type-aliases/DiscoverRequestValidation.md)

Defined in: [protocol/discovery.ts:288](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L288)

Validates a raw `server/discover` request payload. (§5.3.1)

Checks, in order:
  1. the object is present and its `method` is `"server/discover"`;
  2. `params` is present and is an object carrying `_meta`;
  3. `_meta` carries the three REQUIRED reserved keys with correct types
     (delegated to `validateRequestMeta`, R-5.3.1-a – R-5.3.1-d).

Extra `_meta` keys are accepted (R-5.3.1-e). On success it returns the
declared protocol revision so the caller can decide whether it is supported.

## Parameters

### request

`unknown`

A raw request object (e.g. a classified `JSONRPCRequest`).

## Returns

[`DiscoverRequestValidation`](../type-aliases/DiscoverRequestValidation.md)
