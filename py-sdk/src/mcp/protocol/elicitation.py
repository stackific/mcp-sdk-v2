"""Elicitation I — capability, delivery & modes (§20.1–§20.3).

A server's request for structured user input, gathered and returned through the client.
NOT a server-initiated request: the server returns an ``input_required`` result carrying an
``elicitation/create`` request (the §11 multi-round-trip mechanism). This port owns the
front half: the ``elicitation`` capability (``form``/``url`` sub-flags) + gating, the
embedded ``ElicitRequest`` and its two modes (form ``requestedSchema``; url navigable URL),
mode resolution, the flat-``requestedSchema`` validator, and the builders.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field

from mcp._model import McpModel, validates
from mcp.protocol.capability_negotiation import client_declares, may_use_url_elicitation

ELICITATION_CREATE_METHOD = "elicitation/create"
ELICITATION_MODE_FORM = "form"
ELICITATION_MODE_URL = "url"


def is_elicitation_mode(value: object) -> bool:
  """Return ``True`` when ``value`` is one of the two defined modes. (§20.3)"""
  return value in (ELICITATION_MODE_FORM, ELICITATION_MODE_URL)


# ─── capability value (§20.1) ─────────────────────────────────────────────────

class ElicitationCapabilityValue(McpModel):
  """The ``elicitation`` capability value (§20.1) — an object with OPTIONAL object
  ``form`` / ``url`` sub-flags; extra members pass through. (R-20.1-f)
  """

  form: dict[str, Any] | None = None
  url: dict[str, Any] | None = None


def is_valid_elicitation_capability_value(value: object) -> bool:
  """Return ``True`` for a valid ``elicitation`` capability value: an object with OPTIONAL
  object ``form``/``url`` sub-flags. (§20.1, R-20.1-f)
  """
  return validates(ElicitationCapabilityValue, value)


# ─── requestedSchema (form mode) (§20.3, §20.4) ───────────────────────────────

class RequestedSchema(McpModel):
  """A form-mode ``requestedSchema`` (§20.3): ``type == "object"`` + a ``properties`` map of
  object schemas; OPTIONAL ``required`` (list of strings) and ``$schema`` (string). Other
  JSON-Schema keywords pass through. Flatness (each property primitive) is enforced
  separately by :func:`validate_requested_schema`. (R-20.3-e/-f/-g/-h)
  """

  type: Literal["object"]
  properties: dict[str, dict[str, Any]]
  required: list[str] | None = None
  json_schema: str | None = Field(default=None, alias="$schema")


def is_valid_requested_schema(value: object) -> bool:
  """Return ``True`` for a structurally valid form ``requestedSchema``: ``type == "object"``,
  ``properties`` a map of objects, OPTIONAL ``required`` list of strings, OPTIONAL ``$schema``
  string. (§20.3, R-20.3-e/-f/-g/-h) Flatness is checked by :func:`validate_requested_schema`.
  """
  return validates(RequestedSchema, value)


_NON_FLAT_PROPERTY_KEYWORDS = frozenset(
  {"properties", "items", "prefixItems", "additionalProperties", "patternProperties", "allOf", "anyOf", "oneOf", "$ref"}
)


@dataclass(frozen=True)
class RequestedSchemaValidation:
  """Outcome of :func:`validate_requested_schema`."""

  valid: bool
  schema: dict | None = None
  errors: list = field(default_factory=list)


def validate_requested_schema(value: object) -> RequestedSchemaValidation:
  """Validate the structural restrictions on a form ``requestedSchema``: ``type`` ``"object"``,
  a FLAT ``properties`` map (each property primitive — no nesting keywords, no
  object/array type), and every ``required`` entry declared. (§20.3/§20.4, R-20.3-e/-f/-g)
  """
  if not is_valid_requested_schema(value):
    return RequestedSchemaValidation(False, errors=[{"path": "<root>", "detail": "not a valid requestedSchema object"}])
  errors: list[dict] = []
  props: dict = value["properties"]
  for name, prop_schema in props.items():
    prop_type = prop_schema.get("type")
    if prop_type in ("object", "array"):
      errors.append({"path": f"properties.{name}", "detail": f'property schema must be primitive (flat); type "{prop_type}" is not allowed (R-20.3-f)'})
    for keyword in prop_schema:
      if keyword in _NON_FLAT_PROPERTY_KEYWORDS:
        errors.append({"path": f"properties.{name}.{keyword}", "detail": f'nesting keyword "{keyword}" is not allowed in a flat requestedSchema (R-20.3-f)'})
  for req in value.get("required", []):
    if req not in props:
      errors.append({"path": "required", "detail": f'required property "{req}" is not declared in properties (R-20.3-g)'})
  if errors:
    return RequestedSchemaValidation(False, errors=errors)
  return RequestedSchemaValidation(True, schema=value)


# ─── ElicitRequest params + request (§20.2, §20.3) ────────────────────────────

def is_valid_elicitation_url(url: object) -> bool:
  """Return ``True`` when ``url`` is a valid absolute URI/URL (a scheme + authority or path).
  (§20.3, R-20.3-m/-n)
  """
  if not isinstance(url, str) or url == "":
    return False
  parts = urlsplit(url)
  return parts.scheme != "" and (parts.netloc != "" or parts.path != "")


def _require_elicitation_url(value: str) -> str:
  """Field validator: a url-mode ``url`` MUST be a valid absolute URI/URL. (§20.3, R-20.3-n)"""
  if not is_valid_elicitation_url(value):
    raise ValueError("url-mode elicitation requires a valid absolute URL (R-20.3-n)")
  return value


class FormElicitParams(McpModel):
  """Form-mode ``ElicitRequest`` params (§20.3): OPTIONAL ``mode == "form"``, REQUIRED string
  ``message``, REQUIRED ``requestedSchema`` (a flat-object schema).
  """

  mode: Literal["form"] | None = None
  message: str
  requested_schema: RequestedSchema


class UrlElicitParams(McpModel):
  """URL-mode ``ElicitRequest`` params (§20.3): REQUIRED ``mode == "url"``, string ``message``,
  non-empty ``elicitationId``, and a valid ``url``.
  """

  mode: Literal["url"]
  message: str
  elicitation_id: Annotated[str, Field(min_length=1)]
  url: Annotated[str, AfterValidator(_require_elicitation_url)]


def is_valid_form_params(value: object) -> bool:
  """Return ``True`` for form-mode params: OPTIONAL ``mode == "form"``, REQUIRED string
  ``message``, REQUIRED ``requestedSchema``. (§20.3)
  """
  return validates(FormElicitParams, value)


def is_valid_url_params(value: object) -> bool:
  """Return ``True`` for url-mode params: REQUIRED ``mode == "url"``, string ``message``,
  non-empty ``elicitationId``, valid ``url``. (§20.3)
  """
  return validates(UrlElicitParams, value)


def is_valid_elicit_request_params(value: object) -> bool:
  """Return ``True`` for the mode union (url tried first; form accepts absent ``mode``). (§20.3)"""
  return is_valid_url_params(value) or is_valid_form_params(value)


def is_valid_elicit_request(value: object) -> bool:
  """Return ``True`` for a well-formed ``ElicitRequest``: ``method == "elicitation/create"`` +
  valid mode-specific ``params``. (§20.2)
  """
  if not isinstance(value, dict) or value.get("method") != ELICITATION_CREATE_METHOD:
    return False
  return is_valid_elicit_request_params(value.get("params"))


def is_elicitation_create_request(value: object) -> bool:
  """Return ``True`` for the exact ``"elicitation/create"`` method literal (method-only check).
  (§20.2, R-20.2-b)
  """
  return isinstance(value, dict) and value.get("method") == ELICITATION_CREATE_METHOD


def resolve_elicitation_mode(params: object) -> str | None:
  """Resolve the effective mode: absent/``"form"`` → ``"form"`` (implicit baseline), ``"url"``
  → ``"url"``, anything else → ``None``. (§20.3, R-20.3-b/-c)
  """
  if not isinstance(params, dict):
    return None
  mode = params.get("mode")
  if mode is None or mode == ELICITATION_MODE_FORM:
    return ELICITATION_MODE_FORM
  if mode == ELICITATION_MODE_URL:
    return ELICITATION_MODE_URL
  return None


# ─── capability declaration & mode support (§20.1) ────────────────────────────

def client_supports_elicitation(client_caps: dict) -> bool:
  """Return ``True`` when the client declares ``elicitation``. (§20.1, R-20.1-a)"""
  return client_declares(client_caps, "elicitation")


def supported_elicitation_modes(client_caps: dict) -> list[str]:
  """Return the modes the client supports: declaring ``elicitation`` always implies ``form``
  (baseline); ``url`` only with the ``elicitation.url`` sub-flag; ``[]`` when undeclared.
  (§20.1, R-20.1-c/-f)
  """
  if not client_declares(client_caps, "elicitation"):
    return []
  modes = [ELICITATION_MODE_FORM]
  if may_use_url_elicitation(client_caps):
    modes.append(ELICITATION_MODE_URL)
  return modes


def client_supports_elicitation_mode(client_caps: dict, mode: str) -> bool:
  """Return ``True`` when the client supports ``mode``. (§20.1, R-20.1-c/-f)"""
  return mode in supported_elicitation_modes(client_caps)


# ─── server-side gating (§20.1) ───────────────────────────────────────────────

@dataclass(frozen=True)
class ElicitationGateResult:
  """Outcome of :func:`gate_elicitation_request`: ``ok`` or a ``rejection`` dict."""

  ok: bool
  rejection: dict | None = None


def gate_elicitation_request(client_caps: dict, mode: str = ELICITATION_MODE_FORM) -> ElicitationGateResult:
  """Decide whether a server MAY send an ``elicitation/create`` of ``mode``: rejected with
  ``capability-not-declared`` when ``elicitation`` is undeclared, or ``mode-not-supported``
  when the mode isn't supported. (§20.1, R-20.1-d/-e)
  """
  if not client_declares(client_caps, "elicitation"):
    return ElicitationGateResult(False, rejection={"reason": "capability-not-declared"})
  if not client_supports_elicitation_mode(client_caps, mode):
    return ElicitationGateResult(False, rejection={"reason": "mode-not-supported", "mode": mode})
  return ElicitationGateResult(True)


def may_server_send_elicitation(client_caps: dict, mode: str = ELICITATION_MODE_FORM) -> bool:
  """Return ``True`` exactly when :func:`gate_elicitation_request` permits the request. (§20.1)"""
  return gate_elicitation_request(client_caps, mode).ok


# ─── builders (§20.2, §20.3) ──────────────────────────────────────────────────

def build_form_elicit_request(*, message: str, requested_schema: dict, include_mode: bool = False) -> dict:
  """Build a form-mode ``ElicitRequest`` (``mode`` omitted by default — the backwards-compatible
  encoding). The schema is validated against the flat-object restriction first. (§20.2/§20.3)

  :raises TypeError: when ``requested_schema`` violates the restriction. (§20.4)
  """
  validation = validate_requested_schema(requested_schema)
  if not validation.valid:
    detail = "; ".join(f"{e['path']}: {e['detail']}" for e in validation.errors)
    raise TypeError(f"Invalid requestedSchema for form elicitation: {detail}")
  params: dict = {"message": message, "requestedSchema": validation.schema}
  if include_mode:
    params["mode"] = ELICITATION_MODE_FORM
  return {"method": ELICITATION_CREATE_METHOD, "params": params}


def build_url_elicit_request(*, message: str, elicitation_id: str, url: str) -> dict:
  """Build a url-mode ``ElicitRequest`` (``mode: "url"`` always emitted). (§20.2/§20.3)

  :raises TypeError: when ``url`` is invalid or ``elicitation_id`` is empty. (R-20.3-k/-n)
  """
  if not elicitation_id:
    raise TypeError("url-mode elicitation requires a non-empty elicitationId (R-20.3-k)")
  if not is_valid_elicitation_url(url):
    raise TypeError(f"url-mode elicitation requires a valid URL; got {url!r} (R-20.3-n)")
  return {
    "method": ELICITATION_CREATE_METHOD,
    "params": {"mode": ELICITATION_MODE_URL, "message": message, "elicitationId": elicitation_id, "url": url},
  }
