"""Python MCP reference server (FastAPI) built on the SDK (``stackific-mcp``).

The real Python counterpart to ``ts-mcp-server``: it serves the full companion feature
set over stateless Streamable HTTP (protocol 2026-07-28) on ``/mcp`` via the SDK's async
streaming handler, and runs an OAuth 2.1 Authorization Server + protected MCP resource on
a second port — both in one process. Optional & deletable: the companion is
server-agnostic.
"""

from __future__ import annotations

import asyncio
import os

import uvicorn
from fastapi import FastAPI, Request, Response

from mcp.server import create_asgi_mcp_handler

from auth_app import create_auth_app
from features import build_companion_server

# Ports are owned by the root Taskfile; these defaults match it for standalone runs.
MCP_PORT = int(os.environ.get("PY_MCP_SERVER_PORT", "8101"))
AUTH_PORT = int(os.environ.get("PY_AUTH_PORT", "8103"))

# ── Main companion MCP server (FastAPI + the SDK's async streaming handler) ──
server = build_companion_server()
mcp_handler = create_asgi_mcp_handler(server)

app = FastAPI(title="py-mcp-server")


@app.get("/health")
def health() -> dict[str, str]:
  return {
    "status": "ok",
    "name": "companion-mcp-server",
    "language": "python",
    "framework": "fastapi",
    "sdk": "stackific-mcp",
    "protocol": "2026-07-28",
    "transport": "streamable-http",
  }


@app.api_route("/mcp", methods=["GET", "POST", "OPTIONS"])
async def mcp(request: Request) -> Response:
  """Hand the HTTP request to the SDK's Streamable HTTP handler and relay its response."""
  return await mcp_handler(request)


# ── OAuth 2.1 Authorization Server + protected MCP resource (second port) ──
auth_issuer = os.environ.get("PY_AUTH_ISSUER", f"http://localhost:{AUTH_PORT}")
auth_app = create_auth_app(issuer=auth_issuer, resource=f"{auth_issuer}/mcp")


async def _serve_both() -> None:
  """Run the companion MCP server and the OAuth AS concurrently in one process."""
  main_config = uvicorn.Config(app, host="127.0.0.1", port=MCP_PORT, log_level="info")
  auth_config = uvicorn.Config(auth_app, host="127.0.0.1", port=AUTH_PORT, log_level="info")
  print(
    f"Companion MCP server (FastAPI + stackific-mcp, stateless Streamable HTTP 2026-07-28) "
    f"on http://localhost:{MCP_PORT}/mcp"
  )
  print(f"OAuth AS + protected MCP resource on http://localhost:{AUTH_PORT}  (issuer {auth_issuer})")
  await asyncio.gather(uvicorn.Server(main_config).serve(), uvicorn.Server(auth_config).serve())


if __name__ == "__main__":
  asyncio.run(_serve_both())
