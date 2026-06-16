"""Tools I — capability, listing & the ``Tool`` type (§16.1–§16.4).

The discovery half of MCP tools: how a server announces tools, how a client lists them
(paginated + cacheable), the ``Tool`` definition shape, and the normative JSON Schema
rules governing ``inputSchema`` / ``outputSchema`` — including the §16.4 value
validation a ``tools/call`` handler uses (backed by the ``jsonschema`` Draft 2020-12
validator, the Python analogue of the TS SDK's Ajv). Calling a tool + ``CallToolResult``
live in :mod:`mcp.protocol.tools_call`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal

from jsonschema import Draft202012Validator
from pydantic import AfterValidator, Field, StrictBool, StrictInt

from mcp._model import McpModel, validates
from mcp.protocol.caching import CacheScope
from mcp.protocol.capability_negotiation import (
  client_should_expect_notification,
  may_client_invoke,
  server_declares,
)
from mcp.types.base_metadata import BaseMetadata, resolve_display_name
from mcp.types.icon import Icon

# ─── Method names ─────────────────────────────────────────────────────────────

TOOLS_LIST_METHOD = "tools/list"
TOOLS_CALL_METHOD = "tools/call"
# Owned by the streaming module in the TS SDK; pinned here as the literal for gating.
TOOLS_LIST_CHANGED_METHOD = "notifications/tools/list_changed"


# ─── §16.1 The `tools` server capability ──────────────────────────────────────

class ToolsCapability(McpModel):
  """The value of the ``tools`` key in a server's capabilities (§16.1) — an object with an
  OPTIONAL strict-boolean ``listChanged`` sub-flag; extra members pass through.
  """

  list_changed: StrictBool | None = None


def is_valid_tools_capability(value: object) -> bool:
  """Return ``True`` for a valid ``ToolsCapability``: an object with OPTIONAL boolean
  ``listChanged``; extra members tolerated. (§16.1)
  """
  return validates(ToolsCapability, value)


def server_exposes_tools(server_caps: dict) -> bool:
  """Return ``True`` when the server declares the ``tools`` capability. (§16.1, R-16.1-a)"""
  return server_declares(server_caps, "tools")


def may_server_answer_tools_list(server_caps: dict, method: str = TOOLS_LIST_METHOD) -> bool:
  """Return ``True`` when the server MAY answer ``tools/list`` / ``tools/call``. (§16.1, R-16.1-c)"""
  if method not in (TOOLS_LIST_METHOD, TOOLS_CALL_METHOD):
    return False
  return server_exposes_tools(server_caps)


def may_client_send_tools_request(server_caps: dict, method: str = TOOLS_LIST_METHOD) -> bool:
  """Return ``True`` when a client MAY send ``tools/list`` / ``tools/call``. (§16.1, R-16.1-d)"""
  if method not in (TOOLS_LIST_METHOD, TOOLS_CALL_METHOD):
    return False
  return may_client_invoke(method, server_caps)


def may_server_emit_tools_list_changed(server_caps: dict) -> bool:
  """Return ``True`` when the server MAY emit ``notifications/tools/list_changed``. (R-16.1-b)"""
  return server_declares(server_caps, "tools.listChanged")


def may_client_expect_tools_list_changed(server_caps: dict) -> bool:
  """Return ``True`` when a client may rely on ``notifications/tools/list_changed``. (R-16.1-e)"""
  return client_should_expect_notification(TOOLS_LIST_CHANGED_METHOD, server_caps)


# ─── §16.4 JSON Schema rules for inputSchema / outputSchema ────────────────────

DEFAULT_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
SUPPORTED_SCHEMA_DIALECTS = frozenset({DEFAULT_SCHEMA_DIALECT, DEFAULT_SCHEMA_DIALECT + "#"})


def schema_dialect(schema: dict) -> str:
  """Return the dialect governing a schema: explicit ``$schema`` or the 2020-12 default.
  (§16.4(1), R-16.4-a/-b)
  """
  declared = schema.get("$schema")
  return declared if isinstance(declared, str) else DEFAULT_SCHEMA_DIALECT


def is_supported_schema_dialect(dialect: str) -> bool:
  """Return ``True`` when ``dialect`` is one this implementation can validate. (R-16.4-s/-t)"""
  return dialect in SUPPORTED_SCHEMA_DIALECTS


def is_in_document_ref(ref: str) -> bool:
  """Return ``True`` when a ``$ref``/``$dynamicRef`` resolves WITHIN the document — a
  JSON Pointer (``#``, ``#/…``) or a plain-name anchor (``#anchor``). (§16.4(5), R-16.4-f)
  """
  return ref == "#" or ref.startswith("#/") or (ref.startswith("#") and "/" not in ref)


@dataclass(frozen=True)
class SchemaLimits:
  """Resource bounds an implementation MAY impose on schema processing. (§16.4(6))"""

  max_depth: int
  max_nodes: int


DEFAULT_SCHEMA_LIMITS = SchemaLimits(max_depth=64, max_nodes=10_000)


def has_external_ref(node: object, max_depth: int = DEFAULT_SCHEMA_LIMITS.max_depth) -> bool:
  """Return ``True`` when any ``$ref``/``$dynamicRef`` targets OUTSIDE the document. Pure
  structural inspection — never performs I/O, so it cannot trigger an SSRF fetch.
  (§16.4(5), R-16.4-f/-g/-r)
  """
  def walk(value: object, depth: int) -> bool:
    if depth > max_depth:
      return False
    if isinstance(value, list):
      return any(walk(v, depth + 1) for v in value)
    if isinstance(value, dict):
      for key in ("$ref", "$dynamicRef"):
        ref = value.get(key)
        if isinstance(ref, str) and not is_in_document_ref(ref):
          return True
      return any(walk(v, depth + 1) for v in value.values())
    return False

  return walk(node, 0)


def schema_nesting_depth(node: object, cap: int = DEFAULT_SCHEMA_LIMITS.max_depth + 1) -> int:
  """Return the max nesting depth (objects + arrays); counting stops at ``cap``. (§16.4(6))"""
  def depth_of(value: object, depth: int) -> int:
    if depth >= cap:
      return cap
    if isinstance(value, list):
      return max((depth_of(v, depth + 1) for v in value), default=depth)
    if isinstance(value, dict):
      return max((depth_of(v, depth + 1) for v in value.values()), default=depth)
    return depth

  return depth_of(node, 0)


def _count_nodes(node: object, cap: int) -> int:
  count = 0

  def walk(value: object, depth: int) -> None:
    nonlocal count
    if count > cap or depth > cap:
      return
    if isinstance(value, list):
      count += 1
      for v in value:
        walk(v, depth + 1)
    elif isinstance(value, dict):
      count += 1
      for v in value.values():
        walk(v, depth + 1)

  walk(node, 0)
  return count


class UnsupportedDialectError(Exception):
  """Raised when a tool schema declares a dialect this implementation does not support.
  (§16.4(9), R-16.4-t)
  """

  def __init__(self, dialect: str) -> None:
    super().__init__(f"Unsupported JSON Schema dialect: {dialect}")
    self.dialect = dialect


@dataclass(frozen=True)
class ToolSchemaValidation:
  """Outcome of :func:`validate_tool_schema`."""

  ok: bool
  dialect: str | None = None
  reason: str | None = None


def validate_tool_schema(
  schema: object,
  role: str,
  *,
  limits: SchemaLimits | None = None,
  allow_external_refs: bool = False,
) -> ToolSchemaValidation:
  """Validate a tool's ``inputSchema``/``outputSchema`` against §16.4 (no I/O).

  Checks: valid object; supported dialect; depth + node bounds; no external ``$ref``
  unless opted in; and for ``role == "input"`` the root ``type`` MUST be ``"object"``.
  (R-16.4-d/-f/-g/-k/-l/-n/-s/-t)
  """
  limits = limits or DEFAULT_SCHEMA_LIMITS
  if not isinstance(schema, dict):
    return ToolSchemaValidation(False, reason="schema is not a valid JSON Schema object (R-16.4-n)")
  dialect = schema_dialect(schema)
  if not is_supported_schema_dialect(dialect):
    return ToolSchemaValidation(False, reason=f"unsupported dialect '{dialect}' (R-16.4-t)")
  if schema_nesting_depth(schema, limits.max_depth + 1) > limits.max_depth:
    return ToolSchemaValidation(False, reason=f"schema nesting depth exceeds limit {limits.max_depth} (R-16.4-l, R-16.4-n)")
  if _count_nodes(schema, limits.max_nodes + 1) > limits.max_nodes:
    return ToolSchemaValidation(False, reason=f"schema node count exceeds limit {limits.max_nodes} (R-16.4-m, R-16.4-n)")
  if not allow_external_refs and has_external_ref(schema, limits.max_depth):
    return ToolSchemaValidation(False, reason="schema contains an external $ref that is not permitted (R-16.4-f, R-16.4-k)")
  if role == "input" and schema.get("type") != "object":
    return ToolSchemaValidation(False, reason='inputSchema root type MUST be "object" (R-16.4-d)')
  return ToolSchemaValidation(True, dialect=dialect)


def assert_registrable_tool_schema(
  schema: object,
  role: str,
  *,
  limits: SchemaLimits | None = None,
  allow_external_refs: bool = False,
) -> None:
  """Assert a tool schema is safe to register, raising otherwise. (§16.4(7)(9), R-16.4-n/-t)

  :raises UnsupportedDialectError: when the schema declares an unsupported dialect.
  :raises TypeError: for any other rejection.
  """
  if isinstance(schema, dict):
    dialect = schema_dialect(schema)
    if not is_supported_schema_dialect(dialect):
      raise UnsupportedDialectError(dialect)
  result = validate_tool_schema(schema, role, limits=limits, allow_external_refs=allow_external_refs)
  if not result.ok:
    raise TypeError(f"Refusing to register tool schema: {result.reason}")


# ─── §16.4 JSON Schema VALUE validation (R-16.4-o, R-16.4-p) ───────────────────

@dataclass(frozen=True)
class SchemaValueValidation:
  """Outcome of validating a JSON value against a JSON Schema document."""

  valid: bool
  errors: list[str] = field(default_factory=list)


def validate_value_against_schema(schema: object, value: object) -> SchemaValueValidation:
  """Validate a JSON *value* against a JSON Schema *document* (Draft 2020-12).

  The machinery a ``tools/call`` handler uses to validate ``arguments`` against
  ``inputSchema`` and ``structuredContent`` against ``outputSchema``. Returns
  ``valid=False`` (never raises) when the schema is not a supported 2020-12 object schema
  or cannot be compiled (e.g. an unresolvable external ``$ref``). (§16.4, R-16.4-o/-p)
  """
  if not isinstance(schema, dict):
    return SchemaValueValidation(False, ["schema is not a valid JSON Schema object (R-16.4-n)"])
  dialect = schema_dialect(schema)
  if not is_supported_schema_dialect(dialect):
    return SchemaValueValidation(False, [f"unsupported dialect '{dialect}' (R-16.4-t)"])
  try:
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(value), key=lambda e: list(e.path))
  except Exception as exc:  # noqa: BLE001 — unresolvable $ref / bad schema → not permissive
    return SchemaValueValidation(False, [str(exc) or "schema compilation failed"])
  if not errors:
    return SchemaValueValidation(True, [])
  messages = []
  for err in errors:
    path = "/" + "/".join(str(p) for p in err.path) if err.path else "<root>"
    messages.append(f"{path} {err.message}".strip())
  return SchemaValueValidation(False, messages or ["value does not conform to schema"])


def validate_tool_arguments(tool: dict, args: object) -> SchemaValueValidation:
  """Validate a ``tools/call`` ``arguments`` object against the tool's ``inputSchema``. (R-16.4-o)"""
  return validate_value_against_schema(tool.get("inputSchema"), args)


def validate_tool_structured_content(tool: dict, structured_content: object) -> SchemaValueValidation:
  """Validate a result's ``structuredContent`` against the tool's ``outputSchema``. (R-16.4-p)

  When the tool declares no ``outputSchema`` there is nothing to validate.
  """
  if tool.get("outputSchema") is None:
    return SchemaValueValidation(True, [])
  return validate_value_against_schema(tool["outputSchema"], structured_content)


# ─── §16.3 The Tool type ──────────────────────────────────────────────────────

TOOL_NAME_MIN_LENGTH = 1
TOOL_NAME_MAX_LENGTH = 128
TOOL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


def is_conventional_tool_name(name: str) -> bool:
  """Return ``True`` when a tool ``name`` follows conventions: 1–128 chars, only
  ``A-Z a-z 0-9 _ - .``. (§16.3, R-16.3-b/-c/-d/-e)
  """
  return TOOL_NAME_MIN_LENGTH <= len(name) <= TOOL_NAME_MAX_LENGTH and bool(TOOL_NAME_PATTERN.match(name))


def _require_object_root_schema(schema: dict) -> dict:
  """Field validator: a tool ``inputSchema`` root ``type`` MUST be ``"object"``. (R-16.3-k, R-16.4-d)"""
  if schema.get("type") != "object":
    raise ValueError('inputSchema root type MUST be "object" (R-16.3-k, R-16.4-d)')
  return schema


#: A JSON Schema object whose root ``type`` is ``"object"`` — the analogue of the TS
#: ``z.object({ type: z.literal('object') }).passthrough()`` for ``inputSchema``.
_InputSchema = Annotated[dict[str, Any], AfterValidator(_require_object_root_schema)]


class ToolAnnotations(McpModel):
  """Untrusted behavior hints attached to a ``Tool`` (§16.3; semantics in S25). All fields
  OPTIONAL; booleans are strict; unknown members pass through. (R-16.3-n)
  """

  title: str | None = None
  read_only_hint: StrictBool | None = None
  destructive_hint: StrictBool | None = None
  idempotent_hint: StrictBool | None = None
  open_world_hint: StrictBool | None = None


class Tool(BaseMetadata):
  """A single ``Tool`` definition (§16.3) — the Python analogue of the TS ``ToolSchema``.

  Extends ``BaseMetadata`` (``name`` REQUIRED, ``title`` OPTIONAL) with the schema and
  display fields. ``inputSchema`` is REQUIRED and its root ``type`` MUST be ``"object"``
  (R-16.3-k, R-16.4-d); ``outputSchema`` / ``annotations`` / ``icons`` / ``_meta`` are
  OPTIONAL. Unknown members pass through (forward-compatible).
  """

  description: str | None = None
  input_schema: _InputSchema
  output_schema: dict[str, Any] | None = None
  annotations: ToolAnnotations | None = None
  icons: list[Icon] | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_tool(value: object) -> bool:
  """Return ``True`` for a well-formed ``Tool`` (§16.3): ``BaseMetadata`` + REQUIRED
  ``inputSchema`` whose root ``type`` is ``"object"``; OPTIONAL ``description``,
  ``outputSchema``, ``annotations``, ``icons``, ``_meta``. (R-16.3-a/-k, R-16.4-d)
  """
  return validates(Tool, value)


def tool_display_name(tool: dict) -> str:
  """Resolve a tool's display name: ``title`` → ``annotations.title`` → ``name``. (R-16.3-i)"""
  return resolve_display_name(tool["name"], tool.get("title"), (tool.get("annotations") or {}).get("title"))


def find_duplicate_tool_names(tools: list[dict]) -> list[str]:
  """Return the names occurring more than once across ``tools``. (R-16.3-f/-g)"""
  seen: set[str] = set()
  dupes: list[str] = []
  for tool in tools:
    name = tool["name"]
    if name in seen and name not in dupes:
      dupes.append(name)
    seen.add(name)
  return dupes


def disambiguate_tool_name(server_id: str, name: str, separator: str = ".") -> str:
  """Prefix a tool ``name`` with a server identifier to disambiguate a collision. (R-16.3-h)"""
  return f"{server_id}{separator}{name}"


# ─── §16.2 Listing tools: tools/list ──────────────────────────────────────────

class ListToolsResult(McpModel):
  """The result of ``tools/list`` (§16.2) — the Python analogue of the TS
  ``ListToolsResultSchema``.

  Simultaneously a paginated result (``nextCursor``, §12) and a cacheable result
  (``ttlMs`` / ``cacheScope``, §13) wrapping the REQUIRED page of ``Tool`` definitions.
  ``resultType`` is fixed to ``"complete"`` (R-16.2-m).
  """

  result_type: Literal["complete"]
  tools: list[Tool]
  next_cursor: str | None = None
  ttl_ms: Annotated[StrictInt, Field(ge=0)]
  cache_scope: CacheScope
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_list_tools_result(value: object) -> bool:
  """Return ``True`` for a well-formed ``ListToolsResult`` (§16.2): ``resultType``
  ``"complete"``, a ``tools`` list of valid Tools, OPTIONAL opaque ``nextCursor``,
  REQUIRED non-negative ``ttlMs`` and ``cacheScope``. (R-16.2-b/-c/-g/-j/-m)
  """
  return validates(ListToolsResult, value)


@dataclass(frozen=True)
class ListToolsResultConfig:
  """The server-supplied inputs to a ``ListToolsResult``."""

  tools: list[dict]
  ttl_ms: int
  cache_scope: str
  next_cursor: str | None = None
  meta: dict | None = None


def build_list_tools_result(config: ListToolsResultConfig) -> dict:
  """Build a ``ListToolsResult`` with ``resultType: "complete"``; optional fields only
  when supplied. (§16.2)

  :raises ValueError: when ``ttl_ms`` is negative or not an integer. (R-16.2-g)
  """
  if not isinstance(config.ttl_ms, int) or isinstance(config.ttl_ms, bool) or config.ttl_ms < 0:
    raise ValueError("ListToolsResult.ttlMs MUST be a non-negative integer (R-16.2-g)")
  result: dict = {
    "resultType": "complete",
    "tools": list(config.tools),
    "ttlMs": config.ttl_ms,
    "cacheScope": config.cache_scope,
  }
  if config.next_cursor is not None:
    result["nextCursor"] = config.next_cursor
  if config.meta is not None:
    result["_meta"] = config.meta
  return result


class ListToolsRequestParams(McpModel):
  """The ``params`` of a ``tools/list`` request (§16.2): OPTIONAL opaque ``cursor`` and
  OPTIONAL ``_meta``; a first-page request MAY omit both. (R-16.2-a)
  """

  cursor: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_list_tools_request_params(value: object) -> bool:
  """Return ``True`` for a valid ``tools/list`` ``params`` object (§16.2): OPTIONAL opaque
  string ``cursor`` and OPTIONAL ``_meta`` map; extra members tolerated. (R-16.2-a)
  """
  return validates(ListToolsRequestParams, value)


def is_valid_list_tools_request(value: object) -> bool:
  """Return ``True`` for a well-formed ``tools/list`` request envelope (§16.2): ``jsonrpc``
  ``"2.0"``, a request ``id``, ``method`` ``"tools/list"``, and OPTIONAL ``params`` (a valid
  :func:`is_valid_list_tools_request_params`). Omitting ``params`` entirely requests the
  first page. (R-16.2-a)
  """
  if not isinstance(value, dict):
    return False
  if value.get("jsonrpc") != "2.0" or "id" not in value:
    return False
  if value.get("method") != TOOLS_LIST_METHOD:
    return False
  return "params" not in value or is_valid_list_tools_request_params(value["params"])


def build_list_tools_request(id_: str | int, cursor: str | None = None, extra_meta: dict | None = None) -> dict:
  """Build a ``tools/list`` request. A supplied ``cursor`` is passed VERBATIM (opaque);
  omitting it requests the first page. (§16.2, R-16.2-a/-d/-e/-f)
  """
  request: dict = {"jsonrpc": "2.0", "id": id_, "method": TOOLS_LIST_METHOD}
  if cursor is not None or extra_meta is not None:
    params: dict = {}
    if cursor is not None:
      params["cursor"] = cursor
    if extra_meta is not None:
      params["_meta"] = extra_meta
    request["params"] = params
  return request
