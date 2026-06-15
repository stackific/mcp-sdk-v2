[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / selectRegistrationMechanism

# Function: selectRegistrationMechanism()

> **selectRegistrationMechanism**(`context`): [`RegistrationMechanismSelection`](../interfaces/RegistrationMechanismSelection.md)

Defined in: [protocol/authorization-registration.ts:154](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L154)

Selects the `client_id` mechanism from the VALIDATED authorization-server
metadata and the client's credential state, applying the §23.11 priority order
and the metadata gates. (R-23.11-a, R-23.11-b, R-23.11-c, R-23.11-d, R-23.11-e)

The order, using the first that applies:
  1. pre-registration — when the client already holds credentials for this AS;
  2. CIMD — only when the AS metadata sets
     `client_id_metadata_document_supported: true` (R-23.11-d) AND the client
     supports it;
  3. DCR — only when the AS metadata advertises a `registration_endpoint`
     (R-23.11-e) AND the client supports it;
  4. `prompt` — otherwise prompt the user for client information.

The function inspects the metadata before deciding (R-23.11-c) and never
returns `cimd`/`dcr` when the corresponding gate is closed (R-23.11-d,
R-23.11-e), so a caller acting on the result will not attempt a mechanism the
AS does not support. This complements S36's `selectClientIdMechanism`, which
ranks a static capability set; here the live metadata flags are the deciding
input.

## Parameters

### context

[`RegistrationMechanismContext`](../interfaces/RegistrationMechanismContext.md)

The validated AS metadata, credential state, and capabilities.

## Returns

[`RegistrationMechanismSelection`](../interfaces/RegistrationMechanismSelection.md)
