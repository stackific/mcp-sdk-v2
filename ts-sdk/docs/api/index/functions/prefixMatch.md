[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / prefixMatch

# Function: prefixMatch()

> **prefixMatch**(`seed`, `candidates`, `opts?`): `string`[]

Defined in: [protocol/completion.ts:550](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L550)

A reference prefix matcher: returns the `candidates` whose value starts with
the seed `argument.value`, in input order. (§19.5, R-19.5-d, AC-29.20)

This is the simplest of the SHOULD-permitted strategies (prefix / substring /
fuzzy); a server MAY substitute any matcher and any ranking — that choice is
the server's. (R-19.5-c, R-19.5-d) When the seed is the empty string `""`,
every candidate matches, yielding suggestions appropriate to empty input.
(R-19.2-i, AC-29.8)

Matching is case-sensitive by default; pass `caseInsensitive` to fold case.

## Parameters

### seed

`string`

The current partial value (`argument.value`).

### candidates

readonly `string`[]

The full candidate pool to match against.

### opts?

OPTIONAL `caseInsensitive` flag.

#### caseInsensitive?

`boolean`

## Returns

`string`[]
