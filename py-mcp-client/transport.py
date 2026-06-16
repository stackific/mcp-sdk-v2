"""A raw Streamable HTTP ``initialize`` probe used by the Transport & HTTP page to show
the actual HTTP request/response headers and status mapping (S12, S14, S15).
"""

from __future__ import annotations

import httpx

from config import MCP_SERVER_URL


def transport_probe() -> dict:
  """POST a minimal ``initialize`` and report the request/response headers + status."""
  request_headers = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28",
  }
  body = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {"protocolVersion": "2026-07-28", "capabilities": {}, "clientInfo": {"name": "transport-probe", "version": "0"}},
  }
  resp = httpx.post(MCP_SERVER_URL, headers=request_headers, json=body, timeout=10.0)
  response_headers = {k: v for k, v in resp.headers.items()}
  return {
    "url": MCP_SERVER_URL,
    "method": "POST",
    "requestHeaders": request_headers,
    "status": resp.status_code,
    "statusText": resp.reason_phrase,
    "contentType": resp.headers.get("content-type"),
    "sessionId": resp.headers.get("mcp-session-id"),
    "negotiatedVersion": resp.headers.get("mcp-protocol-version"),
    "responseHeaders": response_headers,
  }
