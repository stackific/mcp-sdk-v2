"""Re-exports the canonical ``Implementation`` descriptor for import-path stability.

The full ``Implementation`` shape (§14.3) — composing ``BaseMetadata`` (``name`` /
``title``) and ``Icons`` (``icons``) and adding ``version`` (REQUIRED), ``description``
and ``websiteUrl`` (both OPTIONAL) — is DEFINED in :mod:`mcp.types.implementation`. This
module is the Python analogue of the TS SDK's ``protocol/implementation.ts``, which is a
thin re-export of ``types/implementation.ts`` kept so existing callers importing from the
``protocol`` layer keep working. Prefer importing from :mod:`mcp.types.implementation`
(or the icon helpers from :mod:`mcp.types.icon`) directly in new code.

Re-exported surface (mirrors the TS module's exports, adapted to Python):

* :class:`Implementation` — the parsed dataclass descriptor (TS ``Implementation`` type).
* :func:`parse_implementation` — parse + validate, raising on a bad shape (TS
  ``parseImplementation`` / ``ImplementationSchema.parse``).
* :func:`is_valid_implementation` — the boolean predicate (the validation core, the
  Python analogue of the TS SDK's ``ImplementationSchema.safeParse(...).success``).
* :func:`is_valid_icon` — the ``Icon`` structural validator (TS ``IconSchema``).
* :data:`ICON_THEMES` — the closed icon-theme set (TS ``IconTheme``).

Wire examples (§14.3)::

    {"name": "example-client", "version": "0.1.0"}
    {"name": "example-server", "title": "Example MCP Server", "version": "2.4.1",
     "description": "Provides filesystem and search tools.",
     "websiteUrl": "https://example.com/mcp",
     "icons": [{"src": "https://example.com/icon.png", "mimeType": "image/png"}]}
"""

from __future__ import annotations

from mcp.types.icon import ICON_THEMES, is_valid_icon
from mcp.types.implementation import (
  Implementation,
  is_valid_implementation,
  parse_implementation,
)

__all__ = [
  "Implementation",
  "parse_implementation",
  "is_valid_implementation",
  "is_valid_icon",
  "ICON_THEMES",
]
