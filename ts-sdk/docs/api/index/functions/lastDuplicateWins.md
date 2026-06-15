[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / lastDuplicateWins

# Function: lastDuplicateWins()

> **lastDuplicateWins**(`entries`): [`JSONObject`](../type-aliases/JSONObject.md)

Defined in: [json/value.ts:89](https://github.com/stackific/mcp-sdk-node/blob/main/src/json/value.ts#L89)

Produces an object from an array of [name, value] pairs, applying the
last-duplicate-wins rule (§2.3.1, R-2.3.1-c, AC-02.3).

When a receiver does not reject an object with duplicate member names as
malformed, it MUST behave as though only the last occurrence is present.
This function makes that behaviour explicit and testable.

## Parameters

### entries

readonly readonly \[`string`, [`JSONValue`](../type-aliases/JSONValue.md)\][]

## Returns

[`JSONObject`](../type-aliases/JSONObject.md)
