"""Elicitation II — restricted form schema, results & consent (§20.4–§20.8).

The payload + outcome surface for elicitation: the ``PrimitiveSchemaDefinition`` value type
(string/number/boolean + the five enum forms), the restricted form-schema validator, the
``content``↔``requestedSchema`` conformance check, the ``ElicitResult`` action semantics +
builders, the ``notifications/elicitation/complete`` notification, and the §20.7 consent /
anti-phishing helpers (sensitive-field detection, URL safety, consent presentation, user
identity binding). Builds on :mod:`mcp.protocol.elicitation`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated, Any, Literal
from urllib.parse import parse_qsl, urlsplit

from pydantic import Field, StrictBool, TypeAdapter

from mcp._model import JsonNumber, McpModel, validates
from mcp.protocol.elicitation import (
  ELICITATION_MODE_URL,
  is_valid_requested_schema,
)

# ─── primitive field schemas (§20.4) ──────────────────────────────────────────

STRING_SCHEMA_FORMATS = ("email", "uri", "date", "date-time")
NUMBER_SCHEMA_TYPES = ("number", "integer")


def _is_number(value: object) -> bool:
  return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_string_schema_format(value: object) -> bool:
  """Return ``True`` for one of the four permitted ``StringSchema.format`` literals. (R-20.4-d)"""
  return value in STRING_SCHEMA_FORMATS


class StringSchema(McpModel):
  """A free-text ``StringSchema`` primitive (§20.4): ``type: "string"`` + optional length
  bounds / ``format`` / ``default``. Does not consider ``enum``/``oneOf`` (those select an
  enum) — extra keys pass through.
  """

  type: Literal["string"]
  title: str | None = None
  description: str | None = None
  default: str | None = None
  min_length: JsonNumber | None = None
  max_length: JsonNumber | None = None
  format: Literal["email", "uri", "date", "date-time"] | None = None


class NumberSchema(McpModel):
  """A ``NumberSchema`` primitive (§20.4, R-20.4-e): ``type`` ``number``/``integer`` + optional
  ``minimum``/``maximum``/``default``.
  """

  type: Literal["number", "integer"]
  title: str | None = None
  description: str | None = None
  minimum: JsonNumber | None = None
  maximum: JsonNumber | None = None
  default: JsonNumber | None = None


class BooleanSchema(McpModel):
  """A ``BooleanSchema`` primitive (§20.4): ``type: "boolean"`` + optional ``default`` bool."""

  type: Literal["boolean"]
  title: str | None = None
  description: str | None = None
  default: StrictBool | None = None


def is_valid_string_schema(value: object) -> bool:
  """Return ``True`` for a free-text ``StringSchema`` (``type: "string"``; optional length
  bounds, ``format``, ``default``). Does not consider ``enum``/``oneOf``. (§20.4)
  """
  return validates(StringSchema, value)


def is_valid_number_schema(value: object) -> bool:
  """Return ``True`` for a ``NumberSchema`` (``type`` ``number``/``integer``; optional bounds,
  ``default``). (§20.4, R-20.4-e)
  """
  return validates(NumberSchema, value)


def is_valid_boolean_schema(value: object) -> bool:
  """Return ``True`` for a ``BooleanSchema`` (``type: "boolean"``; optional ``default`` bool).
  (§20.4)
  """
  return validates(BooleanSchema, value)


# ─── EnumSchema family (§20.4) ─────────────────────────────────────────────────


class TitledEnumOption(McpModel):
  """One option of a titled enum: the wire ``const`` value plus its display ``title``.
  Both are REQUIRED. (§20.4)
  """

  const: str
  title: str


class UntitledSingleSelectEnum(McpModel):
  """A single choice from a list of string values, with no separate display labels:
  ``type: "string"`` + REQUIRED ``enum`` (``string[]``). (§20.4)
  """

  type: Literal["string"]
  title: str | None = None
  description: str | None = None
  enum: list[str]
  default: str | None = None


class TitledSingleSelectEnum(McpModel):
  """A single choice where each option carries a display label via REQUIRED ``oneOf``
  (one ``{const, title}`` entry per option). (§20.4)
  """

  type: Literal["string"]
  title: str | None = None
  description: str | None = None
  one_of: list[TitledEnumOption]
  default: str | None = None


class UntitledMultiSelectItems(McpModel):
  """The ``items`` schema of an untitled multi-select enum: a string ``enum``. (§20.4)"""

  type: Literal["string"]
  enum: list[str]


class UntitledMultiSelectEnum(McpModel):
  """Selection of zero or more values from a list, no separate labels: ``type: "array"``
  + REQUIRED ``items`` (a string ``enum``) + optional count bounds. (§20.4)
  """

  type: Literal["array"]
  title: str | None = None
  description: str | None = None
  min_items: JsonNumber | None = None
  max_items: JsonNumber | None = None
  items: UntitledMultiSelectItems
  default: list[str] | None = None


class TitledMultiSelectItems(McpModel):
  """The ``items`` schema of a titled multi-select enum: an ``anyOf`` of options. (§20.4)"""

  any_of: list[TitledEnumOption]


class TitledMultiSelectEnum(McpModel):
  """Selection of zero or more values where each option carries a display label via
  REQUIRED ``items.anyOf`` + optional count bounds. (§20.4)
  """

  type: Literal["array"]
  title: str | None = None
  description: str | None = None
  min_items: JsonNumber | None = None
  max_items: JsonNumber | None = None
  items: TitledMultiSelectItems
  default: list[str] | None = None


class LegacyTitledEnum(McpModel):
  """Deprecated legacy titled enum: per-value labels via a parallel ``enumNames`` array,
  non-standard for JSON Schema 2020-12. Defined only for interoperability — a peer MAY
  still send it; prefer :class:`TitledSingleSelectEnum` for new work. (§20.4, R-20.4-f, R-20.4-g)

  .. deprecated::
    Use :class:`TitledSingleSelectEnum` for per-option labels in new functionality.
    (§20.4, R-20.4-f, R-20.4-g)
  """

  type: Literal["string"]
  title: str | None = None
  description: str | None = None
  enum: list[str]
  enum_names: list[str] | None = None
  default: str | None = None


# The five-form ``EnumSchema`` union. Members are tried most-specific first so a
# structurally ambiguous object is matched to the form that uses its distinguishing
# keyword (the closed analogue of TS ``EnumSchemaSchema``). The :func:`classify_enum_schema`
# helper reports the precise structural form.
EnumSchema = Annotated[
  TitledSingleSelectEnum
  | UntitledMultiSelectEnum
  | TitledMultiSelectEnum
  | LegacyTitledEnum
  | UntitledSingleSelectEnum,
  Field(union_mode="left_to_right"),
]

_ENUM_SCHEMA_ADAPTER: TypeAdapter[Any] = TypeAdapter(EnumSchema)


def is_valid_titled_enum_option(value: object) -> bool:
  """Return ``True`` for a titled enum option: REQUIRED string ``const`` + ``title``. (§20.4)"""
  return validates(TitledEnumOption, value)


def classify_enum_schema(value: object) -> str | None:
  """Classify an enum schema into one of five structural forms by distinguishing keyword, or
  ``None`` when not an enum schema. ``enumNames`` marks the Deprecated legacy form. (§20.4)
  """
  if not isinstance(value, dict):
    return None
  type_ = value.get("type")
  if type_ == "array":
    items = value.get("items")
    if not isinstance(items, dict):
      return None
    if isinstance(items.get("anyOf"), list):
      return "titled-multi-select"
    if isinstance(items.get("enum"), list):
      return "untitled-multi-select"
    return None
  if type_ == "string":
    if isinstance(value.get("oneOf"), list):
      return "titled-single-select"
    if isinstance(value.get("enum"), list):
      return "legacy-titled" if isinstance(value.get("enumNames"), list) else "untitled-single-select"
  return None


def is_valid_enum_schema(value: object) -> bool:
  """Return ``True`` for a member of the closed ``EnumSchema`` union — any of the five
  structural forms. (§20.4)

  Mirrors TS ``EnumSchemaSchema.safeParse``: validation is delegated to the
  :data:`EnumSchema` union, while :func:`classify_enum_schema` reports the precise form.
  """
  if not isinstance(value, dict):
    return False
  try:
    _ENUM_SCHEMA_ADAPTER.validate_python(value)
    return True
  except Exception:  # noqa: BLE001 — any validation failure means "not a valid EnumSchema"
    return False


def is_legacy_titled_enum_schema(value: object) -> bool:
  """Return ``True`` for the Deprecated legacy enum form (string ``enum`` + ``enumNames``).
  (§20.4, R-20.4-f)

  .. deprecated::
    Use :class:`TitledSingleSelectEnum` for per-option labels in new functionality.
    (§20.4, R-20.4-f, R-20.4-g)
  """
  return classify_enum_schema(value) == "legacy-titled"


def classify_primitive_schema(value: object) -> str | None:
  """Classify a property schema by the ``PrimitiveSchemaDefinition`` member it selects
  (``string``/``number``/``boolean``/``enum``), or ``None``. Structural per §20.4's table.
  """
  if not isinstance(value, dict):
    return None
  type_ = value.get("type")
  if type_ == "boolean":
    return "boolean" if is_valid_boolean_schema(value) else None
  if type_ in NUMBER_SCHEMA_TYPES:
    return "number" if is_valid_number_schema(value) else None
  if type_ == "array":
    return "enum" if classify_enum_schema(value) else None
  if type_ == "string":
    if isinstance(value.get("enum"), list) or isinstance(value.get("oneOf"), list):
      return "enum" if classify_enum_schema(value) else None
    return "string" if is_valid_string_schema(value) else None
  return None


def is_primitive_schema_definition(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid ``PrimitiveSchemaDefinition``. (§20.4)"""
  return is_valid_number_schema(value) or is_valid_boolean_schema(value) or is_valid_enum_schema(value) or is_valid_string_schema(value)


# ─── restricted form schema validation (§20.4) ────────────────────────────────

@dataclass(frozen=True)
class RestrictedFormSchemaValidation:
  """Outcome of :func:`validate_restricted_form_schema`."""

  valid: bool
  schema: dict | None = None
  errors: list = field(default_factory=list)


def validate_restricted_form_schema(value: object) -> RestrictedFormSchemaValidation:
  """Validate a form ``requestedSchema`` against the FULL restricted form schema: the outer
  object shape PLUS every property being a valid ``PrimitiveSchemaDefinition`` (the enum
  array forms are the carved-out exceptions, not forbidden nesting). (§20.4, R-20.4-a)
  """
  if not is_valid_requested_schema(value):
    return RestrictedFormSchemaValidation(False, errors=[{"path": "<root>", "detail": "not a valid requestedSchema object"}])
  errors: list[dict] = []
  props: dict = value["properties"]
  for name, prop_schema in props.items():
    if classify_primitive_schema(prop_schema) is None:
      errors.append({"path": f"properties.{name}", "detail": "property schema is not a valid PrimitiveSchemaDefinition (string | number | boolean | enum) (R-20.4-a)"})
  for req in value.get("required", []):
    if req not in props:
      errors.append({"path": "required", "detail": f'required property "{req}" is not declared in properties (R-20.4-a)'})
  if errors:
    return RestrictedFormSchemaValidation(False, errors=errors)
  return RestrictedFormSchemaValidation(True, schema=value)


def is_restricted_form_schema(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid restricted form ``requestedSchema``. (R-20.4-a)"""
  return validate_restricted_form_schema(value).valid


def extract_defaults(requested_schema: object) -> dict:
  """Extract the per-field ``default`` values declared in a form schema, for pre-population.
  (§20.4, R-20.4-c)
  """
  out: dict = {}
  if not isinstance(requested_schema, dict):
    return out
  props = requested_schema.get("properties")
  if not isinstance(props, dict):
    return out
  for name, prop_schema in props.items():
    if isinstance(prop_schema, dict) and "default" in prop_schema:
      out[name] = prop_schema["default"]
  return out


# ─── ElicitResult actions + content typing (§20.5) ────────────────────────────

ELICIT_ACTION_ACCEPT = "accept"
ELICIT_ACTION_DECLINE = "decline"
ELICIT_ACTION_CANCEL = "cancel"
_ELICIT_ACTIONS = (ELICIT_ACTION_ACCEPT, ELICIT_ACTION_DECLINE, ELICIT_ACTION_CANCEL)


def is_elicit_action(value: object) -> bool:
  """Return ``True`` for one of the three defined actions. (§20.5, R-20.5-a)"""
  return value in _ELICIT_ACTIONS


def is_valid_elicit_content_value(value: object) -> bool:
  """Return ``True`` for a permitted content value: string, number, boolean, or list of
  strings. (§20.5, R-20.5-c)
  """
  if isinstance(value, str) or isinstance(value, bool):
    return True
  if _is_number(value):
    return True
  return isinstance(value, list) and all(isinstance(v, str) for v in value)


def is_valid_elicit_content(value: object) -> bool:
  """Return ``True`` for a valid ``content`` map (field → permitted value). (§20.5, R-20.5-c)"""
  return isinstance(value, dict) and all(is_valid_elicit_content_value(v) for v in value.values())


#: A permitted elicitation content value (§20.5, R-20.5-c): string, boolean, number, or a
#: list of strings. ``StrictBool`` keeps booleans distinct from numbers.
_ElicitContentValue = str | StrictBool | int | float | list[str]


class StrictElicitResult(McpModel):
  """An ``ElicitResult`` with §20.5 content typing — the Python analogue of the TS
  ``ElicitResultSchema``: REQUIRED ``action`` discriminator + OPTIONAL permitted-typed
  ``content`` map.
  """

  action: Literal["accept", "decline", "cancel"]
  content: dict[str, _ElicitContentValue] | None = None


def is_valid_strict_elicit_result(value: object) -> bool:
  """Return ``True`` for an ``ElicitResult`` with §20.5 content typing: REQUIRED ``action`` +
  OPTIONAL permitted-typed ``content``. (§20.5)
  """
  return validates(StrictElicitResult, value)


# ─── content ↔ requestedSchema conformance (§20.5) ────────────────────────────

def _content_value_matches_kind(value: object, kind: str, prop_schema: dict) -> bool:
  if kind == "string":
    return isinstance(value, str)
  if kind == "number":
    if not _is_number(value):
      return False
    return isinstance(value, int) if prop_schema.get("type") == "integer" else True
  if kind == "boolean":
    return isinstance(value, bool)
  if kind == "enum":
    form = classify_enum_schema(prop_schema)
    if form in ("untitled-multi-select", "titled-multi-select"):
      return isinstance(value, list) and all(isinstance(v, str) for v in value)
    return isinstance(value, str)
  return False


def _enum_values_of(prop_schema: dict) -> set[str] | None:
  form = classify_enum_schema(prop_schema)
  if form in ("untitled-single-select", "legacy-titled"):
    return {v for v in prop_schema["enum"] if isinstance(v, str)}
  if form == "titled-single-select":
    return {o["const"] for o in prop_schema["oneOf"] if isinstance(o, dict) and isinstance(o.get("const"), str)}
  if form == "untitled-multi-select":
    return {v for v in prop_schema["items"]["enum"] if isinstance(v, str)}
  if form == "titled-multi-select":
    return {o["const"] for o in prop_schema["items"]["anyOf"] if isinstance(o, dict) and isinstance(o.get("const"), str)}
  return None


@dataclass(frozen=True)
class ElicitContentValidation:
  """Outcome of :func:`validate_elicit_content`."""

  valid: bool
  content: dict | None = None
  errors: list = field(default_factory=list)


def validate_elicit_content(content: object, requested_schema: object) -> ElicitContentValidation:
  """Validate an accepted form ``content`` map against the ``requestedSchema``: permitted
  value types, per-field type + constraint conformance, all required fields present, no
  unknown fields. (§20.5, R-20.5-c)
  """
  schema_validation = validate_restricted_form_schema(requested_schema)
  if not schema_validation.valid:
    return ElicitContentValidation(False, errors=[{"path": "<root>", "detail": "requestedSchema is not a valid restricted form schema (R-20.4-a)"}])
  if not is_valid_elicit_content(content):
    return ElicitContentValidation(False, errors=[{"path": "<root>", "detail": "content carries a value of a disallowed type (R-20.5-c)"}])

  errors: list[dict] = []
  props: dict = schema_validation.schema["properties"]
  required = set(schema_validation.schema.get("required", []))

  for key in content:
    if key not in props:
      errors.append({"path": key, "detail": f'field "{key}" is not declared in requestedSchema (R-20.5-c)'})
  for req in required:
    if req not in content:
      errors.append({"path": req, "detail": f'required field "{req}" is missing (R-20.5-c)'})

  for name, prop_schema in props.items():
    if name not in content:
      continue
    value = content[name]
    kind = classify_primitive_schema(prop_schema)
    if kind is None:
      continue
    if not _content_value_matches_kind(value, kind, prop_schema):
      errors.append({"path": name, "detail": f"value does not match the {kind} field schema (R-20.5-c)"})
      continue
    if kind == "string":
      if _is_number(prop_schema.get("minLength")) and len(value) < prop_schema["minLength"]:
        errors.append({"path": name, "detail": f"string shorter than minLength {prop_schema['minLength']} (R-20.5-c)"})
      if _is_number(prop_schema.get("maxLength")) and len(value) > prop_schema["maxLength"]:
        errors.append({"path": name, "detail": f"string longer than maxLength {prop_schema['maxLength']} (R-20.5-c)"})
    elif kind == "number":
      if _is_number(prop_schema.get("minimum")) and value < prop_schema["minimum"]:
        errors.append({"path": name, "detail": f"number below minimum {prop_schema['minimum']} (R-20.5-c)"})
      if _is_number(prop_schema.get("maximum")) and value > prop_schema["maximum"]:
        errors.append({"path": name, "detail": f"number above maximum {prop_schema['maximum']} (R-20.5-c)"})
    elif kind == "enum":
      allowed = _enum_values_of(prop_schema)
      values = value if isinstance(value, list) else [value]
      if allowed is not None:
        for v in values:
          if isinstance(v, str) and v not in allowed:
            errors.append({"path": name, "detail": f'value "{v}" is not one of the permitted enum values (R-20.5-c)'})
      form = classify_enum_schema(prop_schema)
      if form in ("untitled-multi-select", "titled-multi-select") and isinstance(value, list):
        if _is_number(prop_schema.get("minItems")) and len(value) < prop_schema["minItems"]:
          errors.append({"path": name, "detail": f"fewer than minItems {prop_schema['minItems']} selections (R-20.5-c)"})
        if _is_number(prop_schema.get("maxItems")) and len(value) > prop_schema["maxItems"]:
          errors.append({"path": name, "detail": f"more than maxItems {prop_schema['maxItems']} selections (R-20.5-c)"})

  if errors:
    return ElicitContentValidation(False, errors=errors)
  return ElicitContentValidation(True, content=content)


@dataclass(frozen=True)
class ElicitResultValidation:
  """Outcome of :func:`validate_elicit_result`."""

  valid: bool
  result: dict | None = None
  errors: list = field(default_factory=list)


def validate_elicit_result(result: object, mode: str, requested_schema: object | None = None) -> ElicitResultValidation:
  """Validate an ``ElicitResult`` against the §20.5 action/content rules: ``content`` is
  permitted ONLY on a form-mode ``accept``, and (when present) conforms to
  ``requestedSchema``. (§20.5, R-20.5-a/-b/-c)
  """
  if not is_valid_strict_elicit_result(result):
    return ElicitResultValidation(False, errors=[{"path": "<root>", "detail": "not a valid ElicitResult (action + permitted content types)"}])
  errors: list[dict] = []
  has_content = "content" in result
  if has_content:
    if result["action"] != ELICIT_ACTION_ACCEPT:
      errors.append({"path": "content", "detail": f'content is only permitted on an "accept" action; got "{result["action"]}" (R-20.5-b)'})
    elif mode == ELICITATION_MODE_URL:
      errors.append({"path": "content", "detail": "content MUST be omitted for a URL-mode response (R-20.5-b)"})
    elif requested_schema is not None:
      content_validation = validate_elicit_content(result["content"], requested_schema)
      if not content_validation.valid:
        for e in content_validation.errors:
          errors.append({"path": f"content.{e['path']}", "detail": e["detail"]})
  if errors:
    return ElicitResultValidation(False, errors=errors)
  return ElicitResultValidation(True, result=result)


@dataclass(frozen=True)
class ElicitActionOutcome:
  """A server's handling directive for an ``ElicitResult``."""

  handle: str  # process-form-data | await-url-completion | declined | cancelled | malformed
  content: dict | None = None
  errors: list = field(default_factory=list)


def resolve_elicit_action_outcome(result: object, mode: str, requested_schema: object | None = None) -> ElicitActionOutcome:
  """Map an ``ElicitResult`` to the server's handling directive, encoding the §20.5 rule that
  a server MUST NOT assume success and MUST handle decline/cancel/malformed. (§20.5)
  """
  validation = validate_elicit_result(result, mode, requested_schema)
  if not validation.valid:
    return ElicitActionOutcome("malformed", errors=validation.errors)
  action = validation.result["action"]
  if action == ELICIT_ACTION_DECLINE:
    return ElicitActionOutcome("declined")
  if action == ELICIT_ACTION_CANCEL:
    return ElicitActionOutcome("cancelled")
  if mode == ELICITATION_MODE_URL:
    return ElicitActionOutcome("await-url-completion")
  return ElicitActionOutcome("process-form-data", content=validation.result.get("content") or {})


# ─── ElicitResult builders (§20.5) ────────────────────────────────────────────

def build_accept_result(content: dict, requested_schema: object) -> dict:
  """Build a form-mode ``accept`` result with validated ``content`` (pre-send check). (§20.5)

  :raises TypeError: when ``content`` does not conform to ``requested_schema``.
  """
  validation = validate_elicit_content(content, requested_schema)
  if not validation.valid:
    detail = "; ".join(f"{e['path']}: {e['detail']}" for e in validation.errors)
    raise TypeError(f"Invalid elicitation content: {detail}")
  return {"action": ELICIT_ACTION_ACCEPT, "content": validation.content}


def build_url_accept_result() -> dict:
  """Build a URL-mode ``accept`` result — consent, carrying NO content. (§20.5, R-20.5-b)"""
  return {"action": ELICIT_ACTION_ACCEPT}


def build_decline_result() -> dict:
  """Build a ``decline`` result (no content). (§20.5)"""
  return {"action": ELICIT_ACTION_DECLINE}


def build_cancel_result() -> dict:
  """Build a ``cancel`` result (no content). (§20.5)"""
  return {"action": ELICIT_ACTION_CANCEL}


# ─── elicitation-complete notification (§20.6) ────────────────────────────────

ELICITATION_COMPLETE_NOTIFICATION_METHOD = "notifications/elicitation/complete"


def is_elicitation_complete_notification(value: object) -> bool:
  """Return ``True`` for a well-formed ``notifications/elicitation/complete`` (REQUIRED
  ``params.elicitationId``). (§20.6)
  """
  if not isinstance(value, dict) or value.get("jsonrpc") != "2.0":
    return False
  if value.get("method") != ELICITATION_COMPLETE_NOTIFICATION_METHOD:
    return False
  params = value.get("params")
  return isinstance(params, dict) and isinstance(params.get("elicitationId"), str) and params["elicitationId"] != ""


def build_elicitation_complete_notification(elicitation_id: str) -> dict:
  """Build a ``notifications/elicitation/complete`` for ``elicitation_id``. (§20.6)

  :raises TypeError: when ``elicitation_id`` is empty. (R-20.6-b)
  """
  if not isinstance(elicitation_id, str) or elicitation_id == "":
    raise TypeError("elicitation-complete notification requires a non-empty elicitationId (R-20.6-b)")
  return {"jsonrpc": "2.0", "method": ELICITATION_COMPLETE_NOTIFICATION_METHOD, "params": {"elicitationId": elicitation_id}}


@dataclass(frozen=True)
class ElicitationCompleteHandling:
  """Outcome of :func:`handle_elicitation_complete`."""

  action: str  # "ignore" | "complete"
  reason: str | None = None
  elicitation_id: str | None = None


def handle_elicitation_complete(notification: object, known: dict) -> ElicitationCompleteHandling:
  """Decide a client's reaction to an elicitation-complete notification: ignore an unknown or
  already-completed id; otherwise complete. (§20.6, R-20.6-d/-e)
  """
  if not is_elicitation_complete_notification(notification):
    return ElicitationCompleteHandling("ignore", reason="unknown-id")
  elicitation_id = notification["params"]["elicitationId"]
  state = known.get(elicitation_id)
  if state is None:
    return ElicitationCompleteHandling("ignore", reason="unknown-id")
  if state == "completed":
    return ElicitationCompleteHandling("ignore", reason="already-completed")
  return ElicitationCompleteHandling("complete", elicitation_id=elicitation_id)


# ─── sensitive info & form-vs-url mode (§20.7) ────────────────────────────────

SENSITIVE_FIELD_MARKERS = (
  "password", "passwd", "secret", "api key", "apikey", "api-key", "access token", "access_token",
  "accesstoken", "token", "credential", "private key", "card number", "cardnumber", "cvv", "cvc", "ssn", "payment",
)


def _looks_sensitive(text: object) -> bool:
  if not isinstance(text, str):
    return False
  hay = text.lower()
  return any(m in hay for m in SENSITIVE_FIELD_MARKERS)


def find_sensitive_form_fields(requested_schema: object) -> list[str]:
  """Return form fields whose name/title/description matches a sensitive-credential marker — a
  server MUST NOT collect these via form mode (route to URL mode). (§20.7, R-20.7-h/-i)
  """
  flagged: list[str] = []
  if not isinstance(requested_schema, dict):
    return flagged
  props = requested_schema.get("properties")
  if not isinstance(props, dict):
    return flagged
  for name, prop_schema in props.items():
    fields = [name]
    if isinstance(prop_schema, dict):
      fields.append(str(prop_schema.get("title") or ""))
      fields.append(str(prop_schema.get("description") or ""))
    if any(_looks_sensitive(f) for f in fields):
      flagged.append(name)
  return flagged


@dataclass(frozen=True)
class SensitiveFieldCheck:
  """Outcome of :func:`assert_form_mode_may_collect`."""

  ok: bool
  sensitive_fields: list = field(default_factory=list)


def assert_form_mode_may_collect(requested_schema: object) -> SensitiveFieldCheck:
  """Assert a form ``requestedSchema`` requests no sensitive credential data. (§20.7, R-20.7-h/-i)"""
  sensitive = find_sensitive_form_fields(requested_schema)
  return SensitiveFieldCheck(True) if not sensitive else SensitiveFieldCheck(False, sensitive_fields=sensitive)


# ─── safe URL construction & handling (§20.7) ─────────────────────────────────

_URL_SENSITIVE_PARAM_MARKERS = (
  "password", "secret", "token", "access_token", "api_key", "apikey", "auth", "authorization",
  "session", "sessionid", "credential", "ssn", "card",
)


def _parse_http_url(url: object):
  if not isinstance(url, str) or url == "":
    return None
  parts = urlsplit(url)
  if parts.scheme == "":
    return None
  if parts.scheme in ("http", "https", "ws", "wss", "ftp") and parts.netloc == "":
    return None
  return parts


@dataclass(frozen=True)
class ElicitationUrlSafety:
  """Outcome of :func:`check_elicitation_url_safety`."""

  safe: bool
  reasons: list = field(default_factory=list)


def check_elicitation_url_safety(url: object, *, allow_insecure: bool = False) -> ElicitationUrlSafety:
  """Check a server-constructed elicitation URL against §20.7 safe construction: no embedded
  credentials, no sensitive query params, HTTPS outside development. (§20.7, R-20.7-p/-q/-s)
  """
  parts = _parse_http_url(url)
  if parts is None:
    return ElicitationUrlSafety(False, reasons=[{"reason": "invalid-url"}])
  reasons: list[dict] = []
  if parts.username or parts.password:
    reasons.append({"reason": "pre-authenticated", "detail": "URL embeds userinfo credentials (user:pass@host) (R-20.7-q)"})
  flagged = [k for k, _ in parse_qsl(parts.query, keep_blank_values=True) if any(m in k.lower() for m in _URL_SENSITIVE_PARAM_MARKERS)]
  if flagged:
    reasons.append({"reason": "contains-sensitive-info", "detail": f"query parameters look sensitive: {', '.join(flagged)} (R-20.7-p, R-20.7-q)"})
  if not allow_insecure and parts.scheme != "https":
    reasons.append({"reason": "insecure-scheme", "detail": f'scheme "{parts.scheme}" is not https (R-20.7-s)'})
  return ElicitationUrlSafety(True) if not reasons else ElicitationUrlSafety(False, reasons=reasons)


@dataclass(frozen=True)
class UrlConsentPresentation:
  """The consent-presentation data a client MUST show before opening an elicitation URL."""

  full_url: str
  host: str
  domain: str
  scheme: str
  contains_punycode: bool
  warnings: list = field(default_factory=list)


def build_url_consent_presentation(url: str) -> UrlConsentPresentation:
  """Build the consent-presentation data for a URL-mode elicitation URL (full URL + highlighted
  host + Punycode/ambiguity warnings). Does NOT open or prefetch. (§20.7, R-20.7-v/-x)

  :raises TypeError: when ``url`` is not a valid absolute URL.
  """
  parts = _parse_http_url(url)
  if parts is None:
    raise TypeError(f"Cannot present an invalid elicitation URL for consent: {url!r}")
  host = parts.hostname or ""
  labels = host.split(".")
  domain = ".".join(labels[-2:]) if len(labels) >= 2 else host
  contains_punycode = any(label.startswith("xn--") for label in host.lower().split("."))
  warnings: list[str] = []
  if contains_punycode:
    warnings.append("Host contains Punycode (xn--); the displayed name may differ from the real domain.")
  if parts.username or parts.password:
    warnings.append("URL embeds credentials in its userinfo; treat with suspicion.")
  if parts.scheme != "https":
    warnings.append(f"URL uses a non-HTTPS scheme ({parts.scheme}).")
  return UrlConsentPresentation(full_url=url, host=host, domain=domain, scheme=parts.scheme, contains_punycode=contains_punycode, warnings=warnings)


def may_render_url_clickable(field_name: str, mode: str) -> bool:
  """Return ``True`` only for the ``url`` field of a URL-mode request — no other field of any
  elicitation request may be clickable. (§20.7, R-20.7-r/-y)
  """
  return mode == ELICITATION_MODE_URL and field_name == "url"


# ─── server-side identity binding (§20.7) ─────────────────────────────────────

@dataclass(frozen=True)
class ElicitationUserBindingResult:
  """Outcome of :func:`verify_elicitation_user_binding`."""

  ok: bool
  reason: str | None = None
  expected: str | None = None
  actual: str | None = None
  detail: str | None = None


def verify_elicitation_user_binding(mcp_session_subject: str | None, browser_session_subject: str | None) -> ElicitationUserBindingResult:
  """Verify that the user who opened a URL-mode elicitation is the one who started it —
  comparing server-verified subjects (never identity from the URL). (§20.7, R-20.7-j–-o)
  """
  if not mcp_session_subject:
    return ElicitationUserBindingResult(False, reason="unverified-identity", detail="missing server-verified MCP-session subject (R-20.7-j, R-20.7-k)")
  if not browser_session_subject:
    return ElicitationUserBindingResult(False, reason="unverified-identity", detail="missing server-verified browser-session subject (R-20.7-l)")
  if mcp_session_subject != browser_session_subject:
    return ElicitationUserBindingResult(False, reason="subject-mismatch", expected=mcp_session_subject, actual=browser_session_subject)
  return ElicitationUserBindingResult(True)
