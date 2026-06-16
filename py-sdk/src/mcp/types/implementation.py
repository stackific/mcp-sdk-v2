"""The ``Implementation`` descriptor (§14.3).

``Implementation`` identifies a piece of MCP software (a client or a server). It
composes ``BaseMetadata`` (name/title) and ``Icons`` and adds ``version`` (REQUIRED),
``description`` and ``websiteUrl`` (both OPTIONAL).

Required: ``name``, ``version``. Optional: ``title``, ``icons``, ``description``,
``websiteUrl``. Unknown properties are tolerated (the §2.3.4 forward-compatibility
rule) — captured in :attr:`Implementation.extra` (the passthrough fields).

Wire examples::

    {"name": "example-client", "version": "0.1.0"}
    {"name": "example-server", "title": "Example MCP Server", "version": "2.4.1",
     "description": "Provides filesystem and search tools.",
     "websiteUrl": "https://example.com/mcp"}
"""

from __future__ import annotations

from mcp._model import McpModel, validates
from mcp.types.icon import Icon


class Implementation(McpModel):
  """A parsed ``Implementation`` descriptor (§14.3, R-14.3-a – R-14.3-f) — the Python
  analogue of the TS ``ImplementationSchema``.

  Spec-defined fields are surfaced as attributes; any additional members are preserved in
  :attr:`~mcp._model.McpModel.extra` so the forward-compatibility rule (§2.3.4) holds.
  """

  #: REQUIRED. Programmatic identifier of the implementation. (R-14.3-a)
  name: str
  #: REQUIRED. Version string; format is implementation-defined. (R-14.3-d)
  version: str
  #: OPTIONAL. Human display name. (R-14.3-b)
  title: str | None = None
  #: OPTIONAL. Icons representing the implementation. (R-14.3-c)
  icons: list[Icon] | None = None
  #: OPTIONAL. Human-readable description of what this implementation does. (R-14.3-e)
  description: str | None = None
  #: OPTIONAL. URL of the implementation's website. (R-14.3-f)
  website_url: str | None = None


def is_valid_implementation(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid ``Implementation``.

  REQUIRED: string ``name`` and string ``version``; optional fields, when present, must
  have the right type. Unknown fields are forward-compatible. (R-14.3-a, R-14.3-d)
  """
  return validates(Implementation, value)


def parse_implementation(value: object) -> Implementation:
  """Parse and validate an ``Implementation`` descriptor.

  Unknown properties are preserved in :attr:`~mcp._model.McpModel.extra` (§2.3.4).

  :raises ValidationError: when ``name`` or ``version`` is absent or not a string.
  """
  return Implementation.model_validate(value)
