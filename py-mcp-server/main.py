"""Placeholder Python MCP server (FastAPI).

This is intentionally NOT a real MCP implementation. It exists to demonstrate that
selecting "Python" in the companion frontend wires up a *different stack of servers*
— this reference server plus its client host (py-mcp-client) — on its own ports.

A real implementation would speak MCP's stateless Streamable HTTP (protocol
2026-07-28) on /mcp, mirroring the TypeScript reference server (ts-mcp-server).
"""

import os

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

# Port is owned by the root Taskfile; this default matches it for standalone runs.
PORT = int(os.environ.get("PY_MCP_SERVER_PORT", "8101"))

app = FastAPI(title="py-mcp-server (placeholder)")


@app.get("/health")
def health() -> dict[str, str]:
  """Liveness probe — also how py-mcp-client proves this server is reachable."""
  return {
    "status": "ok",
    "name": "py-mcp-server (placeholder)",
    "language": "python",
    "framework": "fastapi",
    "protocol": "2026-07-28",
    "transport": "streamable-http",
  }


@app.api_route("/mcp", methods=["GET", "POST"])
def mcp() -> JSONResponse:
  """Placeholder MCP endpoint. A real server would handle JSON-RPC here."""
  return JSONResponse(
    {
      "placeholder": True,
      "language": "python",
      "message": (
        "py-mcp-server is a placeholder. A real implementation would speak MCP "
        "stateless Streamable HTTP (2026-07-28) here, like ts-mcp-server."
      ),
    }
  )


if __name__ == "__main__":
  # reload=True needs the import-string form so the reloader can re-import the app.
  uvicorn.run("main:app", host="127.0.0.1", port=PORT, reload=True)
