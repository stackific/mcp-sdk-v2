"""Placeholder Python MCP client host (FastAPI).

This mirrors the *shape* of the TypeScript client host (ts-mcp-client): it is the
backend the shared companion frontend talks to when "Python" is selected. It serves
the same REST + Server-Sent-Events surface the SPA expects, but it does NOT host a
real MCP client — every capability call returns a friendly "not implemented in the
placeholder" response. Its only job is to demonstrate that the language switch
repoints the frontend at a different backend + server configuration.

A real implementation would host an MCP client connected to py-mcp-server over
Streamable HTTP and stream live JSON-RPC frames on /debug/stream.
"""

import asyncio
import json
import os
import time
import urllib.request

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

# Ports + the server URL are owned by the root Taskfile; these defaults match it so
# the app also runs standalone.
PORT = int(os.environ.get("PY_MCP_CLIENT_PORT", "8102"))
MCP_SERVER_BASE = os.environ.get("PY_MCP_SERVER_URL", "http://localhost:8101").rstrip("/")
MCP_ENDPOINT = f"{MCP_SERVER_BASE}/mcp"

app = FastAPI(title="py-mcp-client (placeholder)")

# The frontend is served from a different origin (port 8000), so allow cross-origin
# requests + the JSON content-type preflight.
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_methods=["*"],
  allow_headers=["*"],
)


def status_payload() -> dict:
  """BackendStatus shape the frontend renders (see frontend/src/lib/api.ts)."""
  return {
    "connected": True,
    "negotiatedVersion": "2026-07-28",
    "serverInfo": {"name": "py-mcp-server (placeholder)", "version": "0.1.0"},
    "serverCapabilities": {},
    "roots": [],
    "serverUrl": MCP_ENDPOINT,
  }


def probe_server() -> dict:
  """Best-effort GET of py-mcp-server's /health — shows the client→server wiring."""
  try:
    with urllib.request.urlopen(f"{MCP_SERVER_BASE}/health", timeout=1.5) as resp:
      return {"reachable": True, "health": json.loads(resp.read())}
  except Exception as exc:  # noqa: BLE001 — placeholder probe, any failure is informative
    return {"reachable": False, "error": str(exc), "url": f"{MCP_SERVER_BASE}/health"}


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok", "language": "python", "framework": "fastapi"}


@app.get("/info")
def info() -> dict:
  return {
    "name": "py-mcp-client (placeholder)",
    "language": "python",
    "serverUrl": MCP_ENDPOINT,
    "status": status_payload(),
  }


@app.get("/api/status")
def api_status() -> dict:
  return status_payload()


@app.post("/api/connect")
def api_connect() -> dict:
  return {"ok": True, "result": status_payload()}


@app.get("/api/discover")
def api_discover() -> dict:
  return {
    "ok": True,
    "result": {
      "placeholder": True,
      "language": "python",
      "stack": {"client": "py-mcp-client (FastAPI)", "server": "py-mcp-server (FastAPI)"},
      "serverUrl": MCP_ENDPOINT,
      "server": probe_server(),
      "note": (
        "Placeholder discover. A real py-mcp-client would run server/discover "
        "against py-mcp-server and return its identity + capabilities."
      ),
    },
  }


@app.get("/debug/stream")
async def debug_stream() -> StreamingResponse:
  """SSE relay matching the TS backend, so the frontend's wire panel stays happy."""

  def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

  async def events():
    yield sse("status", status_payload())
    yield sse(
      "frame",
      {
        "seq": 1,
        "ts": int(time.time() * 1000),
        "dir": "local",
        "kind": "note",
        "summary": (
          "Python placeholder stack — no live MCP wire. Switch to TypeScript for "
          "the full under-the-hood experience."
        ),
      },
    )
    while True:
      await asyncio.sleep(15)
      yield sse("ping", {})

  return StreamingResponse(
    events(),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
  )


# Catch-all for every capability the placeholder doesn't implement. Registered last,
# so the specific routes above win; Starlette matches routes in declaration order.
@app.api_route("/api/{path:path}", methods=["GET", "POST"])
def api_not_implemented(path: str) -> JSONResponse:
  return JSONResponse(
    {
      "ok": False,
      "error": {
        "message": (
          f"'/api/{path}' isn't implemented in the Python placeholder stack — "
          "switch to TypeScript for the full experience."
        )
      },
    }
  )


if __name__ == "__main__":
  uvicorn.run("main:app", host="127.0.0.1", port=PORT, reload=True)
