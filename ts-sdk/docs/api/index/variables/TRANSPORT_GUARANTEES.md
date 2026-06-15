[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TRANSPORT\_GUARANTEES

# Variable: TRANSPORT\_GUARANTEES

> `const` **TRANSPORT\_GUARANTEES**: `object`

Defined in: [transport/contract.ts:232](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L232)

The transport-agnostic guarantees every transport MUST uphold. (§7.2)

These are documentation anchors mapping each guarantee to its normative atom;
the runtime enforcement lives in `framing.ts` (framing, UTF-8, integrity),
`correlation.ts` (id-correlation, multiplexing, ordering, disconnection), and
a conforming `Transport` (no silent loss, clean close).

## Type Declaration

### FRAMING

> `readonly` **FRAMING**: readonly \[`"R-7.2-b"`, `"R-7.2-c"`, `"R-7.2-d"`\]

Unambiguous, body-independent message framing. (R-7.2-b, R-7.2-c, R-7.2-d)

### ASSOCIATION\_BY\_ID

> `readonly` **ASSOCIATION\_BY\_ID**: readonly \[`"R-7.2-e"`, `"R-7.2-f"`, `"R-7.2-g"`, `"R-7.2-o"`\]

Response↔request association by `id` only. (R-7.2-e, R-7.2-f, R-7.2-g, R-7.2-o)

### MULTIPLEXING

> `readonly` **MULTIPLEXING**: readonly \[`"R-7.2-i"`, `"R-7.2-j"`, `"R-7.2-k"`, `"R-7.2-l"`\]

Multiplexing of concurrent outstanding requests. (R-7.2-i – R-7.2-l)

### ORDERING

> `readonly` **ORDERING**: readonly \[`"R-7.2-m"`, `"R-7.2-n"`, `"R-7.2-p"`\]

Response-ordering independence. (R-7.2-m, R-7.2-n, R-7.2-p)

### NO\_SILENT\_LOSS

> `readonly` **NO\_SILENT\_LOSS**: readonly \[`"R-7.2-q"`, `"R-7.2-r"`, `"R-7.2-s"`\]

No silent loss. (R-7.2-q, R-7.2-r, R-7.2-s)

### CLEAN\_CLOSE

> `readonly` **CLEAN\_CLOSE**: readonly \[`"R-7.2-t"`\]

Clean, observable shutdown/close. (R-7.2-t)
