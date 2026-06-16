"""Per-request capability negotiation model (§1.5, §2.2.2).

Capabilities are declared per request, not once per connection. A client attaches its
declared capabilities to each request; a server MUST NOT infer a capability from any
prior request, connection, or stream (R-2.2.2-a, AC-01.14).

An endpoint MUST NOT exercise a feature the peer has not declared. If processing a
request requires an undeclared capability, the server MUST reject it with the dedicated
missing-capability error (R-2.2.2-b/-c). The numeric wire code lives in
:mod:`mcp.protocol.meta` / :mod:`mcp.protocol.errors` (``-32003``); this module models
the per-request assertion with a symbolic-coded exception.
"""

from __future__ import annotations

from collections.abc import Set


class MissingCapabilityError(Exception):
  """Raised when a request requires a capability the peer did not declare for it.

  (R-2.2.2-c, AC-01.15) Carries a symbolic ``code`` and the offending ``capability``.
  """

  #: Symbolic code; the numeric wire value is ``-32003`` (see protocol.errors).
  code = "MISSING_CAPABILITY"

  def __init__(self, capability: str) -> None:
    super().__init__(f"Missing required capability: {capability}")
    self.capability = capability


def assert_capability(declared_capabilities: Set[str], required: str) -> None:
  """Assert that ``required`` has been declared by the peer for the current request.

  Stateless by design: the caller supplies the capabilities declared on *this* request,
  never accumulated state, enforcing the per-request rule (R-2.2.2-a, AC-01.14).

  :raises MissingCapabilityError: when ``required`` is not in ``declared_capabilities``.
  """
  if required not in declared_capabilities:
    raise MissingCapabilityError(required)


def has_capability(declared_capabilities: Set[str], required: str) -> bool:
  """Return ``True`` when ``required`` has been declared for the current request.

  Prefer :func:`assert_capability` in enforcement code; use this for conditional logic.
  (R-2.2.2-b, AC-01.12, AC-01.13)
  """
  return required in declared_capabilities
