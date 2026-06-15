[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateToolSchema

# Function: validateToolSchema()

> **validateToolSchema**(`schema`, `role`, `opts?`): [`ToolSchemaValidation`](../type-aliases/ToolSchemaValidation.md)

Defined in: [protocol/tools.ts:344](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L344)

Validates a tool's `inputSchema` or `outputSchema` against the §16.4 rules,
WITHOUT performing any network or file-system retrieval. Returns a structured
result rather than throwing, so callers can reject-or-refuse-registration.
(§16.4, R-16.4-d, R-16.4-e, R-16.4-f, R-16.4-g, R-16.4-k, R-16.4-l, R-16.4-n,
R-16.4-s, R-16.4-t)

Checks, in order:
  1. the schema is a valid JSON Schema object — not `null`, not an array, not a
     non-object (R-16.4-n: "not a valid JSON Schema object, for example null");
  2. its declared/default dialect is supported (else `ok:false` — the caller
     surfaces an unsupported-dialect error, R-16.4-t/s);
  3. resource bounds: nesting depth and node count are within `limits`
     (R-16.4-l, R-16.4-m, R-16.4-n);
  4. when `allowExternalRefs` is `false` (the default, R-16.4-i), the schema
     contains no external `$ref`/`$dynamicRef`; an external reference is
     rejected rather than dereferenced or treated as permissive (R-16.4-f,
     R-16.4-g, R-16.4-k);
  5. for `role === 'input'`, the root `type` MUST be `"object"` (R-16.4-d);
     for `role === 'output'`, the root `type` is unrestricted (R-16.4-e).

## Parameters

### schema

`unknown`

The raw schema document.

### role

[`SchemaRole`](../type-aliases/SchemaRole.md)

`'input'` (root must be `"object"`) or `'output'` (unrestricted).

### opts?

#### limits?

[`SchemaLimits`](../interfaces/SchemaLimits.md)

Resource bounds; defaults to [DEFAULT\_SCHEMA\_LIMITS](../variables/DEFAULT_SCHEMA_LIMITS.md).

#### allowExternalRefs?

`boolean`

Opt-in non-local `$ref` fetching; MUST default
  to `false` / disabled. (R-16.4-h, R-16.4-i)

## Returns

[`ToolSchemaValidation`](../type-aliases/ToolSchemaValidation.md)
