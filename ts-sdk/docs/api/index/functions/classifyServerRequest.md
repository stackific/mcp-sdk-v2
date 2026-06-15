[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyServerRequest

# Function: classifyServerRequest()

> **classifyServerRequest**(`ctx`): [`ServerRequestDisposition`](../type-aliases/ServerRequestDisposition.md)

Defined in: [protocol/conformance-requirements.ts:479](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L479)

Applies the ordered §29.2 baseline-server request checks to ONE self-contained
§4 request and returns its [ServerRequestDisposition](../type-aliases/ServerRequestDisposition.md). (§29.2,
R-29.2-e – R-29.2-n, R-29.4-k)

The checks run strictly in the §7 flow order — judged on this request's own
envelope, NEVER on connection or prior-request state (R-29.1-e, R-29.2-f):
  1. revision supported?            → else -32004 (data: supported, requested)
  2. all §4-required fields present?  → else -32602 (Invalid params)
  3. required client capability declared? → else -32003 (data.requiredCapabilities)
  4. feature gated by advertised cap? → else refuse (not advertised)
  else → accept (proceeds to a resultType-tagged success).

Reuses [validateRequestMeta](validateRequestMeta.md) for the envelope check (so the same
required-field set is honored) and [computeMissingClientCapabilities](computeMissingClientCapabilities.md)
for the capability gate. The revision check uses the declared revision from
the envelope against `serverSupportedRevisions` (always including
[CURRENT\_PROTOCOL\_VERSION](../variables/CURRENT_PROTOCOL_VERSION.md)).

Note the ordering rationale: a malformed protocol-version field (not a
well-formed-but-unsupported revision) is an envelope failure (-32602), so the
revision check first asks whether the declared revision is a well-formed,
server-unsupported one; a structurally invalid envelope falls through to the
-32602 stage.

## Parameters

### ctx

[`ServerRequestContext`](../interfaces/ServerRequestContext.md)

## Returns

[`ServerRequestDisposition`](../type-aliases/ServerRequestDisposition.md)
