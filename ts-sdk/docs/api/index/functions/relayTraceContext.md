[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / relayTraceContext

# Function: relayTraceContext()

> **relayTraceContext**(`inbound`, `outbound`): `Record`\<`string`, `unknown`\>

Defined in: [protocol/logging.ts:239](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/logging.ts#L239)

Copies the three W3C trace-context keys (`traceparent`, `tracestate`, `baggage`)
from `inbound` onto `outbound` unchanged, for intermediary relay. (R-15.4.2-h)

Only keys that are present in `inbound` are copied; absent keys are not added
to `outbound`. Existing values in `outbound` are overwritten to ensure the
inbound values propagate unchanged.

## Parameters

### inbound

`Record`\<`string`, `unknown`\>

### outbound

`Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `unknown`\>

A new object merging `outbound` with the relayed trace-context keys.
