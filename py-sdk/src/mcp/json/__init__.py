"""The JSON value model (§2) and ``_meta`` key naming rules (§2.6.2).

Re-exports the public surface of :mod:`mcp.json.value` and :mod:`mcp.json.meta_key`.
"""

from mcp.json.meta_key import (
  RESERVED_SECOND_LABELS,
  TRACE_CONTEXT_KEYS,
  is_reserved_meta_key_prefix,
  is_valid_baggage,
  is_valid_meta_key,
  is_valid_meta_key_name,
  is_valid_meta_key_prefix,
  is_valid_trace_context_value,
  is_valid_traceparent,
  is_valid_tracestate,
  parse_meta_key,
)
from mcp.json.value import (
  SAFE_INTEGER_MAX,
  SAFE_INTEGER_MIN,
  JSONArray,
  JSONObject,
  JSONValue,
  assert_integer,
  assert_safe_integer,
  is_integer,
  is_json_value,
  is_safe_integer,
  last_duplicate_wins,
  numeric_equal,
)

__all__ = [
  "JSONValue",
  "JSONObject",
  "JSONArray",
  "SAFE_INTEGER_MIN",
  "SAFE_INTEGER_MAX",
  "is_integer",
  "is_safe_integer",
  "assert_integer",
  "assert_safe_integer",
  "numeric_equal",
  "last_duplicate_wins",
  "is_json_value",
  "RESERVED_SECOND_LABELS",
  "TRACE_CONTEXT_KEYS",
  "is_valid_meta_key",
  "is_valid_meta_key_prefix",
  "is_valid_meta_key_name",
  "is_reserved_meta_key_prefix",
  "parse_meta_key",
  "is_valid_traceparent",
  "is_valid_tracestate",
  "is_valid_baggage",
  "is_valid_trace_context_value",
]
