"""Protocol revision & carrying the revision (§5.1–§5.2).

Provides the revision-format validator, the HTTP-transport mirror check, and re-exports
the current revision and support predicate from :mod:`mcp.protocol.meta`. Together with
meta these cover §5:

* R-5.1-a/-b  treat identifiers as opaque, exactly-matched strings; never order/range-compare.
* R-5.2-a/-b  every request carries ``io.modelcontextprotocol/protocolVersion`` (a string).
* R-5.2-c/-d  the HTTP transport mirrors the revision in ``MCP-Protocol-Version`` and the
  header MUST match the ``_meta`` value for the same request.
* R-5.2-e     a mismatch yields HTTP 400 Bad Request.
"""

from __future__ import annotations

from dataclasses import dataclass

# Re-exported so callers may import the current revision + predicates from either the
# revision module (S07, which owns the format rule) or meta (S05, which owns the key).
from mcp.protocol.meta import (
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_REVISION_FORMAT_RE,
  is_supported_protocol_version,
  is_valid_revision_format,
)

__all__ = [
  "CURRENT_PROTOCOL_VERSION",
  "PROTOCOL_REVISION_FORMAT_RE",
  "is_supported_protocol_version",
  "is_valid_revision_format",
  "HTTP_REVISION_MISMATCH_STATUS",
  "MCP_PROTOCOL_VERSION_HEADER",
  "HttpRevisionCheckResult",
  "check_http_revision_header",
]

#: HTTP status returned when the header and the ``_meta`` revision do not match. (R-5.2-e)
HTTP_REVISION_MISMATCH_STATUS = 400
#: Name of the HTTP header that mirrors the protocol revision. (§5.2)
MCP_PROTOCOL_VERSION_HEADER = "MCP-Protocol-Version"


@dataclass(frozen=True)
class HttpRevisionCheckResult:
  """Outcome of :func:`check_http_revision_header`."""

  ok: bool
  status: int | None = None
  message: str | None = None


def check_http_revision_header(header: str | None, meta_version: str) -> HttpRevisionCheckResult:
  """Validate that the ``MCP-Protocol-Version`` header byte-for-byte matches the
  ``io.modelcontextprotocol/protocolVersion`` value in the request's ``_meta``.

  Returns ``ok=True`` when the values match, or when ``header`` is ``None`` (non-HTTP
  transport — no header to check). Returns ``ok=False`` with status ``400`` when the
  header is present but does not equal ``meta_version``. (R-5.2-d, R-5.2-e)
  """
  if header is None:
    return HttpRevisionCheckResult(True)  # non-HTTP transport; nothing to validate
  if header == meta_version:
    return HttpRevisionCheckResult(True)
  return HttpRevisionCheckResult(
    False,
    HTTP_REVISION_MISMATCH_STATUS,
    f'{MCP_PROTOCOL_VERSION_HEADER} header "{header}" does not match _meta '
    f'protocolVersion "{meta_version}" (R-5.2-e)',
  )
