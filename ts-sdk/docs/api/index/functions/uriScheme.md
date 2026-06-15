[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / uriScheme

# Function: uriScheme()

> **uriScheme**(`value`): `string` \| `undefined`

Defined in: [protocol/resources-read.ts:572](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L572)

Extracts the lower-cased scheme of a URI string, or `undefined` when `value`
is not a string with a conformant RFC3986 scheme (`ALPHA *( ALPHA / DIGIT /
"+" / "-" / "." )`). The scheme is everything before the first `:`. (§17.9, R-17.9-e)

## Parameters

### value

`unknown`

## Returns

`string` \| `undefined`

## Example

```ts
uriScheme('file:///x')          // 'file'
uriScheme('Custom-App.v2://x')  // 'custom-app.v2'
uriScheme('not a uri')          // undefined
```
