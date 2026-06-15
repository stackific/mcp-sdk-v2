[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / canonicalizeResourceIdentifier

# Function: canonicalizeResourceIdentifier()

> **canonicalizeResourceIdentifier**(`endpointUrl`): [`CanonicalResourceValidation`](../type-aliases/CanonicalResourceValidation.md)

Defined in: [protocol/authorization.ts:252](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L252)

Validates and canonicalizes an MCP server endpoint URL into its canonical
resource identifier. (§23.1, R-23.1-m – R-23.1-s)

Enforced constraints:
  - MUST be an absolute URI (R-23.1-m); a bare host like `mcp.example.com`
    (no scheme) is rejected.
  - MUST use `https`, or `http` only for a loopback/local host (R-23.1-n).
  - MUST NOT contain a fragment component (R-23.1-o).

Canonicalization applied for robustness (R-23.1-p): the scheme and host are
lowercased. A trailing slash present on the input is preserved — callers
SHOULD omit it unless semantically significant (R-23.1-s, see
[stripDefaultTrailingSlash](stripDefaultTrailingSlash.md)); this function does not strip it because it
cannot know whether the slash is significant.

## Parameters

### endpointUrl

`string`

The MCP server's endpoint URL.

## Returns

[`CanonicalResourceValidation`](../type-aliases/CanonicalResourceValidation.md)
