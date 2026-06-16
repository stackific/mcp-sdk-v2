"""S14 — Tool parameters surfaced as ``Mcp-Param-*`` headers (§9.5).

A server MAY annotate ``inputSchema`` parameters with ``x-mcp-header`` to mirror them
into request headers; clients on this transport MUST support it. This module covers:

* ``x-mcp-header`` annotation validity (§9.5.1) and client rejection of invalid tools
  (§9.5.1) — keeping other tools usable.
* client emission of ``Mcp-Param-{name}`` headers from a tool's schema and the call
  arguments (§9.5.2), with value encoding (:mod:`mcp.transport.http.param_encoding`).
* receiver validation of those headers against the body (§9.5.4), including numeric
  comparison of integers.

The shared header primitives (``MCP_PARAM_HEADER_PREFIX``, ``get_header``,
``is_param_header``, ``build_header_mismatch``, and the ``HttpHeaders`` / ``HttpRejection``
/ ``HttpValidation`` shapes) live in their canonical home,
:mod:`mcp.transport.http.headers`, and are imported (and re-exported) here so this module
takes no second copy.

Python note: ``bool`` is a subclass of ``int``. Every primitive-value branch tests
``bool``/``str``/``int`` explicitly (mirroring the TypeScript ``typeof`` checks) so a
boolean never falls through to the integer path.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from mcp.protocol.errors import HEADER_MISMATCH_CODE
from mcp.transport.http.headers import (
  MCP_PARAM_HEADER_PREFIX,
  HttpHeaders,
  HttpRejection,
  HttpValidation,
  build_header_mismatch,
  get_header,
  is_param_header,
)
from mcp.transport.http.param_encoding import (
  ParamValue,
  decode_header_value,
  encode_header_value,
  is_annotated_integer_in_range,
  is_sentinel_encoded,
  plain_string_form,
)

__all__ = [
  "MCP_PARAM_HEADER_PREFIX",
  "HEADER_MISMATCH_CODE",
  "HttpHeaders",
  "HttpRejection",
  "HttpValidation",
  "get_header",
  "is_param_header",
  "build_header_mismatch",
  "AnnotatedParam",
  "collect_x_mcp_headers",
  "XMcpHeaderNameResult",
  "validate_x_mcp_header_name",
  "ToolDefinition",
  "ToolValidationResult",
  "validate_tool_x_mcp_headers",
  "RejectedTool",
  "FilterToolsResult",
  "filter_valid_tools",
  "param_header_name",
  "build_param_headers",
  "validate_param_headers",
  "is_annotated_integer_in_range",
  "STALE_SCHEMA_STRATEGY",
]

# ─── Helpers ────────────────────────────────────────────────────────────────────


def _is_object(value: object) -> bool:
  """Return ``True`` for a JSON object (a ``dict``), mirroring the TypeScript guard
  that excludes ``null`` and arrays."""
  return isinstance(value, dict)


#: HTTP field-name token: ``1*tchar`` (RFC 7230). Excludes control chars and CR/LF.
TCHAR_RE = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")

#: The JSON primitive types an ``x-mcp-header`` annotation may decorate. (R-9.5.1-e)
ANNOTATABLE_TYPES = frozenset({"integer", "string", "boolean"})


def _read_path(args: dict, path: "list[str]") -> object:
  """Read the value at a property ``path`` from ``args``, or ``None`` when any segment
  is missing or a non-object is encountered along the way.

  Note: a genuine JSON ``null`` and an absent key are both surfaced as ``None`` here;
  callers treat the two identically (both omit/require no header). (R-9.5.2-g/-i)
  """
  cur: object = args
  for key in path:
    if not _is_object(cur):
      return None
    cur = cur.get(key)  # type: ignore[union-attr]
  return cur


# ─── Annotation collection ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class AnnotatedParam:
  """One ``x-mcp-header``-annotated parameter discovered in an ``inputSchema``."""

  #: The raw ``x-mcp-header`` value (the name portion); validated separately.
  raw_name: object
  #: The annotated property's declared JSON ``type``, if any.
  type: Optional[str]
  #: The property path from the schema root (object nesting only).
  path: "list[str]"
  #: ``True`` when the annotation sits under an array ``items`` subschema.
  under_array: bool


def _collect_annotations(
  schema: object,
  path: "list[str]",
  under_array: bool,
  out: "list[AnnotatedParam]",
) -> None:
  """Recursively collect every ``x-mcp-header``-annotated subschema. (R-9.5.1-h)"""
  if not _is_object(schema):
    return

  if "x-mcp-header" in schema:  # type: ignore[operator]
    raw_type = schema.get("type")  # type: ignore[union-attr]
    out.append(
      AnnotatedParam(
        raw_name=schema["x-mcp-header"],  # type: ignore[index]
        type=raw_type if isinstance(raw_type, str) else None,
        path=path,
        under_array=under_array,
      )
    )

  props = schema.get("properties")  # type: ignore[union-attr]
  if _is_object(props):
    for key, sub in props.items():  # type: ignore[union-attr]
      _collect_annotations(sub, [*path, key], under_array, out)
  items = schema.get("items")  # type: ignore[union-attr]
  if _is_object(items):
    _collect_annotations(items, path, True, out)


def collect_x_mcp_headers(input_schema: object) -> "list[AnnotatedParam]":
  """Collect all ``x-mcp-header`` annotations from an ``inputSchema``.

  Returns an empty list for an absent or non-object schema (R-9.5.2-l).
  """
  out: "list[AnnotatedParam]" = []
  _collect_annotations(input_schema, [], False, out)
  return out


# ─── Annotation-name validity (§9.5.1) ──────────────────────────────────────────


@dataclass(frozen=True)
class XMcpHeaderNameResult:
  """Outcome of validating a single ``x-mcp-header`` name.

  ``valid=True`` carries no ``reason``; ``valid=False`` carries the failure ``reason``.
  """

  valid: bool
  reason: Optional[str] = None


def validate_x_mcp_header_name(name: object) -> XMcpHeaderNameResult:
  """Validate one ``x-mcp-header`` name against §9.5.1: non-empty (R-9.5.1-a),
  ``1*tchar`` (R-9.5.1-b), and free of control characters including CR/LF
  (R-9.5.1-c, subsumed by the token grammar)."""
  if not isinstance(name, str) or len(name) == 0:
    return XMcpHeaderNameResult(False, "x-mcp-header MUST be a non-empty string")
  if not TCHAR_RE.match(name):
    return XMcpHeaderNameResult(False, f'x-mcp-header "{name}" is not a valid 1*tchar token')
  return XMcpHeaderNameResult(True)


# ─── Tool validity (§9.5.1) ─────────────────────────────────────────────────────

#: A tool definition: any mapping carrying a ``name`` and an optional ``inputSchema``.
ToolDefinition = dict


@dataclass(frozen=True)
class ToolValidationResult:
  """Outcome of validating a tool's ``x-mcp-header`` annotations."""

  valid: bool
  reason: Optional[str] = None


def validate_tool_x_mcp_headers(tool: ToolDefinition) -> ToolValidationResult:
  """Validate every ``x-mcp-header`` annotation in a tool's ``inputSchema``. (§9.5.1)

  Checks each annotation's name (R-9.5.1-a/b/c), that the annotated parameter's type is
  a primitive ``integer``/``string``/``boolean`` (R-9.5.1-e) and not ``number``
  (R-9.5.1-f), and that all names are case-insensitively unique within the schema
  (R-9.5.1-d). Annotations at any nesting depth are accepted (R-9.5.1-h).
  """
  annotations = collect_x_mcp_headers(tool.get("inputSchema"))
  seen: "set[str]" = set()

  for ann in annotations:
    name_result = validate_x_mcp_header_name(ann.raw_name)
    if not name_result.valid:
      return ToolValidationResult(False, name_result.reason)
    lower = ann.raw_name.lower()  # type: ignore[union-attr]
    if lower in seen:
      return ToolValidationResult(
        False, f'duplicate x-mcp-header "{ann.raw_name}" (case-insensitive)'
      )
    seen.add(lower)

    if ann.type is None or ann.type not in ANNOTATABLE_TYPES:
      return ToolValidationResult(
        False,
        f'x-mcp-header "{ann.raw_name}" must annotate an integer/string/boolean '
        f'parameter, not "{ann.type if ann.type is not None else "unknown"}"',
      )
  return ToolValidationResult(True)


@dataclass(frozen=True)
class RejectedTool:
  """A tool rejected by :func:`filter_valid_tools`, with the reason for logging."""

  tool: str
  reason: str


@dataclass(frozen=True)
class FilterToolsResult:
  """Result of filtering tools: the usable ones plus warnings about rejected ones."""

  tools: "list[ToolDefinition]"
  #: Rejected tools — the caller SHOULD log each as a warning. (R-9.5.1-k)
  warnings: "list[RejectedTool]" = field(default_factory=list)


def filter_valid_tools(tools: "list[ToolDefinition]") -> FilterToolsResult:
  """Filter a ``tools/list`` result, excluding only tools whose ``x-mcp-header``
  annotations are invalid and keeping all valid tools usable. (R-9.5.1-i, R-9.5.1-j)

  The returned ``warnings`` name each rejected tool and the reason so the caller can
  log them. (R-9.5.1-k) Clients on non-HTTP transports MAY skip this entirely
  (R-9.5.1-l) — it is only invoked by the Streamable HTTP client.
  """
  valid: "list[ToolDefinition]" = []
  warnings: "list[RejectedTool]" = []
  for tool in tools:
    result = validate_tool_x_mcp_headers(tool)
    if result.valid:
      valid.append(tool)
    else:
      warnings.append(RejectedTool(tool=tool.get("name", ""), reason=result.reason or ""))
  return FilterToolsResult(tools=valid, warnings=warnings)


# ─── Client emission (§9.5.2) ───────────────────────────────────────────────────


def param_header_name(raw_name: str) -> str:
  """Return the header name for an annotated parameter (e.g. ``Mcp-Param-Region``)."""
  return f"{MCP_PARAM_HEADER_PREFIX}{raw_name}"


def _is_primitive(value: object) -> bool:
  """Return ``True`` for the JSON primitives an annotation may carry: ``str``,
  ``bool``, or ``int`` (``bool`` is allowed even though it subclasses ``int``)."""
  return isinstance(value, (str, bool, int))


def build_param_headers(input_schema: object, args: dict) -> "dict[str, str]":
  """Build the ``Mcp-Param-*`` headers for a ``tools/call`` POST from the tool's
  ``inputSchema`` and the call ``arguments``. (§9.5.2)

  One header per annotated parameter present in ``args``; a parameter whose value is
  ``null``/absent is omitted (R-9.5.2-g, R-9.5.2-i); each present value is encoded per
  §9.5.3 (R-9.5.2-c). Annotations under array ``items`` (no single resolvable value)
  are skipped. An absent/non-object schema yields ``{}`` (R-9.5.2-l).

  :raises ValueError: when an annotated integer value is out of the safe range.
  """
  headers: "dict[str, str]" = {}
  for ann in collect_x_mcp_headers(input_schema):
    if ann.under_array:
      continue
    if not isinstance(ann.raw_name, str) or not validate_x_mcp_header_name(ann.raw_name).valid:
      continue

    value = _read_path(args, ann.path)
    if value is None:
      continue  # omit absent/null (R-9.5.2-g, R-9.5.2-i)
    if not _is_primitive(value):
      continue  # only primitives are annotatable
    headers[param_header_name(ann.raw_name)] = encode_header_value(value)  # type: ignore[arg-type]
  return headers


# ─── Receiver validation (§9.5.4) ───────────────────────────────────────────────


def _header_chars_permissible(value: str) -> bool:
  """Return ``True`` when a header value contains only permissible header characters.

  The pure-ASCII sentinel form is always permissible; otherwise only horizontal tab
  and visible ASCII ``0x20``–``0x7E`` are allowed.
  """
  if is_sentinel_encoded(value):
    return True  # pure-ASCII sentinel form is always safe
  for ch in value:
    code = ord(ch)
    safe = code == 0x09 or 0x20 <= code <= 0x7E
    if not safe:
      return False
  return True


def _values_match(decoded: str, body_value: ParamValue, type_: Optional[str]) -> bool:
  """Compare a decoded header value to a body value, numerically for integers.

  When the annotation type is ``integer`` or the body value is a number (but not a
  ``bool``), both sides are parsed as numbers and compared numerically (R-9.5.4-d);
  otherwise they are compared as their plain string forms.
  """
  body_is_number = isinstance(body_value, int) and not isinstance(body_value, bool)
  if type_ == "integer" or body_is_number:
    h = _to_number(decoded)
    b = _to_number(body_value)
    return h is not None and b is not None and h == b  # numeric (R-9.5.4-d)
  return decoded == plain_string_form(body_value)


def _to_number(value: object) -> Optional[float]:
  """Parse ``value`` as a finite number, mirroring JavaScript ``Number(...)`` for the
  cases this comparison needs. Returns ``None`` for anything non-finite or unparseable
  (so a non-match falls out naturally rather than raising)."""
  if isinstance(value, bool):
    return None
  if isinstance(value, (int, float)):
    return float(value)
  if isinstance(value, str):
    text = value.strip()
    if text == "":
      return None  # JS Number("") === 0, but an empty header is never a numeric match
    try:
      parsed = float(text)
    except ValueError:
      return None
    return parsed if parsed == parsed and parsed not in (float("inf"), float("-inf")) else None
  return None


def validate_param_headers(input_schema: object, args: dict, headers: HttpHeaders) -> HttpValidation:
  """Validate the ``Mcp-Param-*`` headers of a request against its body. (§9.5.4)

  * A recognized header with impermissible characters → ``400`` + ``-32001``. (R-9.5.4-b)
  * A header whose decoded value does not match the body value → ``400`` + ``-32001``;
    integers are compared numerically. (R-9.5.4-c, R-9.5.4-d)
  * A body value present while its header is omitted → ``400`` + ``-32001``. (R-9.5.2-k)
  * A header present while the body value is absent/null → ``400`` + ``-32001``.

  :param input_schema: The tool's ``inputSchema`` (source of annotations).
  :param args: The body ``params.arguments``.
  :param headers: The request headers.
  """
  for ann in collect_x_mcp_headers(input_schema):
    if ann.under_array:
      continue
    if not isinstance(ann.raw_name, str) or not validate_x_mcp_header_name(ann.raw_name).valid:
      continue

    header_name = param_header_name(ann.raw_name)
    header_value = get_header(headers, header_name)
    body_value = _read_path(args, ann.path)
    body_present = body_value is not None

    if not body_present:
      # The client MUST omit the header for null/absent values; an extra header is a
      # mismatch the body-processing receiver rejects.
      if header_value is not None:
        return HttpValidation(
          False, build_header_mismatch(f"{header_name} present but no matching body value")
        )
      continue

    # Body value present → the header is REQUIRED. (R-9.5.2-k)
    if header_value is None:
      return HttpValidation(
        False, build_header_mismatch(f"{header_name} omitted while body value is present")
      )
    if not _header_chars_permissible(header_value):
      return HttpValidation(
        False, build_header_mismatch(f"{header_name} contains impermissible characters")
      )
    if not _is_primitive(body_value):
      continue  # non-primitive body value — outside the annotation contract
    decoded = decode_header_value(header_value)
    if not _values_match(decoded, body_value, ann.type):  # type: ignore[arg-type]
      return HttpValidation(
        False, build_header_mismatch(f"{header_name} value does not match the request body")
      )
  return HttpValidation(True)


# ─── Stale-schema strategy (§9.5.2) ─────────────────────────────────────────────

#: The client strategy for a missing or stale ``inputSchema``. (§9.5.2)
#:
#: * With no/stale schema, the client SHOULD send the ``tools/call`` without custom
#:   ``Mcp-Param-*`` headers — :func:`build_param_headers` returns ``{}`` for an absent
#:   schema. (R-9.5.2-l)
#: * If the server rejects because required custom headers are missing, the client
#:   SHOULD call ``tools/list`` for the current schema and retry. (R-9.5.2-m)
#: * A client MAY pre-load tool definitions by other means to emit headers without a
#:   prior ``tools/list``. (R-9.5.2-n)
STALE_SCHEMA_STRATEGY = {
  "SEND_WITHOUT_HEADERS": "R-9.5.2-l",
  "RETRY_AFTER_TOOLS_LIST": "R-9.5.2-m",
  "MAY_PRELOAD": "R-9.5.2-n",
}
