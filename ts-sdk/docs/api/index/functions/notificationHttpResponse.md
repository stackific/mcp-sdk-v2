[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / notificationHttpResponse

# Function: notificationHttpResponse()

> **notificationHttpResponse**(`accepted`, `rejection?`): [`NotificationHttpResponse`](../interfaces/NotificationHttpResponse.md)

Defined in: [transport/http/headers.ts:373](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L373)

Builds the HTTP response for a posted notification. (R-9.2-g, R-9.2-h, R-9.2-i)

  - accepted → `202 Accepted` with no body.
  - rejected → an HTTP error status (default `400`); the body, if present, is
    a JSON-RPC error response with the `id` omitted.

## Parameters

### accepted

`boolean`

### rejection?

#### status?

`number`

#### error

\{ `code`: `number`; `message`: `string`; `data?`: `unknown`; \}

#### error.code

`number`

#### error.message

`string`

#### error.data?

`unknown`

## Returns

[`NotificationHttpResponse`](../interfaces/NotificationHttpResponse.md)
