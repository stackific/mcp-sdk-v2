[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateInputResponseKinds

# Function: validateInputResponseKinds()

> **validateInputResponseKinds**(`inputRequests`, `inputResponses`): [`InputResponseKindValidationResult`](../type-aliases/InputResponseKindValidationResult.md)

Defined in: [protocol/multi-round-trip.ts:446](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L446)

Validates that each value in `inputResponses` conforms to the expected
`InputResponse` shape for the `InputRequest` kind sent under the same key.

Kind correlation table (R-11.4-e):
  `"elicitation/create"`     → `ElicitResult`        (`action` required)
  `"roots/list"`             → `ListRootsResult`     (`roots` array required)
  `"sampling/createMessage"` → `CreateMessageResult` (`role`, `content`, `model` required)

A client MUST NOT answer with a mismatched kind. (R-11.4-f) Validation here
allows servers to reject such responses with a JSON-RPC error (R-11.5-s).

## Parameters

### inputRequests

`Record`\<`string`, [`InputRequest`](../type-aliases/InputRequest.md)\>

The server's `inputRequests` from the `InputRequiredResult`.

### inputResponses

`Record`\<`string`, `unknown`\>

The client's `inputResponses` from the retry params.

## Returns

[`InputResponseKindValidationResult`](../type-aliases/InputResponseKindValidationResult.md)
