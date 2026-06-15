[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildTasksMissingCapabilityError

# Function: buildTasksMissingCapabilityError()

> **buildTasksMissingCapabilityError**(`method`): `object`

Defined in: [protocol/tasks.ts:651](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L651)

Builds the JSON-RPC error a server returns when a Tasks method is invoked but
the extension is unavailable (not advertised, or the method cannot be
serviced). (§25.2, R-25.2-f, AC-39.6)

## Parameters

### method

`string`

The Tasks method that was invoked (e.g. `"tasks/get"`).

## Returns

`object`

### code

> **code**: `-32003`

### message

> **message**: `string`

### data

> **data**: `object`

#### data.requiredExtension

> **requiredExtension**: `"io.modelcontextprotocol/tasks"`

#### data.method

> **method**: `string`
