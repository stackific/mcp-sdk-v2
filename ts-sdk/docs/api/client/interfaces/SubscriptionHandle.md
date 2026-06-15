[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / SubscriptionHandle

# Interface: SubscriptionHandle

Defined in: client/client.ts:126

A handle to an active subscription opened via [Client.subscribe](../classes/Client.md#subscribe). (§10)

## Properties

### subscriptionId

> **subscriptionId**: `string`

Defined in: client/client.ts:128

The server-assigned subscription id (`io.modelcontextprotocol/subscriptionId`).

***

### acknowledgedFilter

> **acknowledgedFilter**: `Record`\<`string`, `unknown`\>

Defined in: client/client.ts:130

The honored subset of the requested filter, from the acknowledgement.

***

### closed

> **closed**: `Promise`\<`void`\>

Defined in: client/client.ts:132

Resolves when the subscription stream ends (teardown / unsubscribe / disconnect).

## Methods

### unsubscribe()

> **unsubscribe**(): `Promise`\<`void`\>

Defined in: client/client.ts:134

Tears the subscription down (sends `notifications/cancelled` for the listen request).

#### Returns

`Promise`\<`void`\>
