[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / computeCompletion

# Function: computeCompletion()

> **computeCompletion**(`ranked`, `opts?`): `objectOutputType`

Defined in: [protocol/completion.ts:516](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L516)

Reference completion engine: caps an already-ranked candidate list at 100 and
signals truncation, producing the `completion` object every server MUST emit.
(§19.4, R-19.4-c – R-19.4-h, R-19.5-g, R-19.5-h)

Behavior:
  - `values` is the first [MAX\_COMPLETION\_VALUES](../variables/MAX_COMPLETION_VALUES.md) of `ranked` (already in
    descending relevance, R-19.5-c). The cap is hard: `values.length` never
    exceeds 100 even when `ranked` is far larger. (R-19.4-c, R-19.4-d)
  - `total` is set to the FULL number of matches (`ranked.length`) when it
    exceeds what is returned, OR to an explicit `opts.total` when the caller
    knows of more matches than it materialized. `total` MAY exceed
    `values.length`. (R-19.4-f, R-19.4-h)
  - `hasMore` is set to `true` when matches were dropped (`total > values`),
    SHOULD-signaling truncation. (R-19.4-e, R-19.5-h)

Ranking and the match strategy (prefix/substring/fuzzy) are the server's
choice and belong to the caller that produces `ranked`; this helper only caps
and signals. (R-19.5-c, R-19.5-d)

## Parameters

### ranked

readonly `string`[]

Candidate values already ordered by descending relevance.

### opts?

OPTIONAL `total` override (the true match count when `ranked`
  is itself a pre-truncated subset).

#### total?

`number`

## Returns

`objectOutputType`
