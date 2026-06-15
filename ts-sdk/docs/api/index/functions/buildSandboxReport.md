[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildSandboxReport

# Function: buildSandboxReport()

> **buildSandboxReport**(`effectiveCsp`, `granted`): `objectOutputType`

Defined in: [protocol/ui-host.ts:1073](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1073)

Builds the `hostCapabilities.sandbox` report for the initialize result: the
EFFECTIVE CSP the host applied and the GRANTED permission set. The CSP is
resolved via the S41 [resolveCsp](resolveCsp.md) (declared `csp`, else deny-by-default),
and the permissions via [grantedPermissions](grantedPermissions.md). (§26.7, R-26.7-g,
R-26.7-h; AC-42.15)

## Parameters

### effectiveCsp

`objectOutputType`

The effective CSP the host applied (e.g. from
  S41 `resolveCsp`); reported verbatim under `sandbox.csp`.

### granted

`objectOutputType`

The granted permission set (e.g. from
  [grantedPermissions](grantedPermissions.md)); reported verbatim under `sandbox.permissions`.

## Returns

`objectOutputType`
