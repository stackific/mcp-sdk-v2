"""Streamable HTTP transport helpers (§9): request/response framing, header
validation + routing, status mapping, and the ``Mcp-Param-*`` parameter-header
encoding. These are the transport-level primitives the server handler and client
transport build on.

This package ``__init__`` is the public surface of the four helper modules — each
of which declares its own ``__all__`` — re-exported here together with the
JSON-RPC error codes the helpers surface, so callers can import any of them from
``mcp.transport.http``.
"""

from __future__ import annotations

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  PARSE_ERROR_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.transport.http.headers import *  # noqa: F401,F403
from mcp.transport.http.headers import __all__ as _headers_all
from mcp.transport.http.param_encoding import *  # noqa: F401,F403
from mcp.transport.http.param_encoding import __all__ as _param_encoding_all
from mcp.transport.http.param_headers import *  # noqa: F401,F403
from mcp.transport.http.param_headers import __all__ as _param_headers_all
from mcp.transport.http.responses import *  # noqa: F401,F403
from mcp.transport.http.responses import __all__ as _responses_all

#: JSON-RPC error codes surfaced by these helpers, re-exported for convenience.
_ERROR_CODES = (
  "HEADER_MISMATCH_CODE",
  "INVALID_PARAMS_CODE",
  "INVALID_REQUEST_CODE",
  "METHOD_NOT_FOUND_CODE",
  "MISSING_CLIENT_CAPABILITY_CODE",
  "PARSE_ERROR_CODE",
  "UNSUPPORTED_PROTOCOL_VERSION_CODE",
)

__all__ = [
  *_headers_all,
  *_param_encoding_all,
  *_param_headers_all,
  *_responses_all,
  *_ERROR_CODES,
]
