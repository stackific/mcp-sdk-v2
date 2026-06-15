[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitActionOutcome

# Type Alias: ElicitActionOutcome

> **ElicitActionOutcome** = \{ `handle`: `"process-form-data"`; `content`: [`ElicitContent`](ElicitContent.md); \} \| \{ `handle`: `"await-url-completion"`; \} \| \{ `handle`: `"declined"`; \} \| \{ `handle`: `"cancelled"`; \} \| \{ `handle`: `"malformed"`; `errors`: [`ElicitResultError`](../interfaces/ElicitResultError.md)[]; \}

Defined in: [protocol/elicitation-form.ts:923](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L923)

A structured directive for how a server should react to an `ElicitResult`.

## Union Members

### Type Literal

\{ `handle`: `"process-form-data"`; `content`: [`ElicitContent`](ElicitContent.md); \}

form-mode accept with conforming `content`; the server SHOULD process it. (R-20.5-d)

***

### Type Literal

\{ `handle`: `"await-url-completion"`; \}

url-mode accept: consent given, NOT completion; await §20.6 notification. (R-20.5-d)

***

### Type Literal

\{ `handle`: `"declined"`; \}

explicit decline; the server SHOULD offer alternatives. (R-20.5-e)

***

### Type Literal

\{ `handle`: `"cancelled"`; \}

dismissal; the server SHOULD prompt again later. (R-20.5-f)

***

### Type Literal

\{ `handle`: `"malformed"`; `errors`: [`ElicitResultError`](../interfaces/ElicitResultError.md)[]; \}

the result was malformed for its mode; treat as a failure to process. (R-20.5-g, R-20.5-h)
