[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ERROR\_CODE\_REGISTRY

# Variable: ERROR\_CODE\_REGISTRY

> `const` **ERROR\_CODE\_REGISTRY**: `Readonly`\<`Record`\<`number`, [`ErrorCodeRegistryEntry`](../interfaces/ErrorCodeRegistryEntry.md)\>\>

Defined in: [protocol/errors.ts:150](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L150)

The complete §22 error-code registry, keyed by numeric code. (§6.5, §22.2,
§22.3) The same `code` applies on every transport; the optional `httpStatus`
is the Streamable HTTP mapping (§22.6). (R-22-a, R-22.2-a, R-22.3-a, R-22.6-a)

Note that `-32602` has a single entry even though several distinct conditions
collapse onto it (invalid params, invalid/expired cursor, unknown tool/prompt/
template, resource-not-found): the code is the registry key, the specific
condition is conveyed by `message`/`data`. (§22.4)
