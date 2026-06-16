"""Python MCP SDK — a specification-compliant implementation of the Model Context
Protocol (MCP V2 RC, revision ``2026-07-28``).

This package is the Python parity port of ``@stackific/mcp-sdk-ts``. It is laid out
in the same layers the spec builds on, bottom-up:

* :mod:`mcp.json`     — the JSON value model (§2) and ``_meta`` key naming (§2.6.2).
* :mod:`mcp.jsonrpc`  — JSON-RPC 2.0 framing (§3.1–§3.5) and payload shapes (§3.6–§3.9).
* :mod:`mcp.protocol` — protocol-level concerns; :mod:`mcp.protocol.errors` is the
  §22 error-code registry.

The normative source is ``model-context-protocol-specification.md``; docstrings cite
the relevant sections (``§``), requirements (``R-``) and acceptance criteria (``AC-``).
"""

__all__ = ["__version__"]

#: The MCP protocol revision this SDK implements (§7, stateless/handshake-less).
PROTOCOL_REVISION = "2026-07-28"

__version__ = "0.1.0"
