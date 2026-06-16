"""MCP Apps / Interactive UI extension helpers (§26).

Build a ``ui://`` resource and a launcher tool result that embeds it and declares
the UI under the spec ``_meta.ui`` key, which a host renders in a sandboxed iframe.
Pure shaping built on the §26 primitives:

* the UI resource MIME is the verbatim ``text/html;profile=mcp-app`` (§26.4);
* the declaration lives at ``_meta.ui`` as ``{resourceUri, visibility?}`` (§26.3);
* the resource URI MUST use the ``ui://`` scheme.
"""

from __future__ import annotations

#: The exact MIME type a UI (``ui://``) resource is served with. (§26.4, R-26.2-d)
UI_MIME_TYPE = "text/html;profile=mcp-app"
#: The scheme every MCP App resource URI MUST use. (§26.2)
UI_URI_SCHEME = "ui://"
#: The ``_meta`` key under which a tool result declares its UI association. (§26.3)
TOOL_UI_META_KEY = "ui"
#: The default visibility (which actors may invoke the tool) when none is given. (§26.3)
DEFAULT_UI_VISIBILITY = ("model", "app")


def is_ui_resource_uri(uri: object) -> bool:
  """Return ``True`` when ``uri`` is a ``ui://`` resource URI. (§26.2)"""
  return isinstance(uri, str) and uri.startswith(UI_URI_SCHEME)


def ui_resource(uri: str, html: str) -> dict:
  """Build an embedded ``ui://`` resource block with the verbatim UI MIME type. (§26.4)"""
  if not is_ui_resource_uri(uri):
    raise ValueError(f'MCP App resource URI must use the {UI_URI_SCHEME} scheme: "{uri}"')
  return {"uri": uri, "mimeType": UI_MIME_TYPE, "text": html}


def ui_tool_result(uri: str, html: str, *, text: str | None = None, visibility: list[str] | None = None) -> dict:
  """Build a tool result that launches an MCP App. (§26.3)

  Embeds the ``ui://`` resource and declares the UI under ``_meta.ui`` as
  ``{resourceUri, visibility?}`` so the host renders it sandboxed.
  """
  resource = ui_resource(uri, html)
  content: list[dict] = []
  if text:
    content.append({"type": "text", "text": text})
  content.append({"type": "resource", "resource": resource})
  ui_meta: dict = {"resourceUri": uri}
  if visibility is not None:
    ui_meta["visibility"] = visibility
  return {"content": content, "_meta": {TOOL_UI_META_KEY: ui_meta}}
