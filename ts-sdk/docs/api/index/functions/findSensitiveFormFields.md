[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / findSensitiveFormFields

# Function: findSensitiveFormFields()

> **findSensitiveFormFields**(`requestedSchema`): `string`[]

Defined in: [protocol/elicitation-form.ts:1176](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1176)

Inspects a form-mode `requestedSchema` for fields that appear to request
sensitive credential data, which a server MUST NOT collect via form mode (and
MUST instead route through URL mode). (§20.7, R-20.7-h, R-20.7-i)

Returns the list of field names whose name / `title` / `description` matches a
sensitive marker. An empty list means no sensitive fields were detected — note
that general contact/profile data (name, email, username) is NOT categorically
prohibited in form mode and is not flagged. (R-20.7-i)

## Parameters

### requestedSchema

`unknown`

A form-mode `requestedSchema`.

## Returns

`string`[]
