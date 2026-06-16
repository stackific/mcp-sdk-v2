"""Tests for the py-mcp-client REST host, driven against a live SDK MCP server.

A minimal MCP server (built directly on the SDK) is served on an ephemeral port; the
client host is pointed at it so the companion's REST surface is exercised end-to-end:
status/discovery, capability calls, the ApiResult ({ok, result}/{ok, error}) shaping,
and the elicitation bridge. (The streaming wire view + the OAuth flow are covered by the
server integration tests + the live verification.)
"""

from __future__ import annotations

import os
import socket
import threading
import time

import httpx
import pytest
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from mcp.server import McpServer, ToolContext, create_asgi_mcp_handler


def _free_port() -> int:
  s = socket.socket()
  s.bind(("127.0.0.1", 0))
  port = s.getsockname()[1]
  s.close()
  return port


# Pick the upstream port and point the client host at it BEFORE importing the app
# (config reads the env at import time).
_SERVER_PORT = _free_port()
os.environ["PY_MCP_SERVER_URL"] = f"http://127.0.0.1:{_SERVER_PORT}"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

tc = TestClient(app)


def _build_server() -> McpServer:
  server = McpServer({"name": "upstream", "title": "Upstream", "version": "0.1.0"}, {"tools": {}})
  server.register_tool(
    "echo",
    lambda args, ctx: {"content": [{"type": "text", "text": str(args.get("text", ""))}]},
    input_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
  )

  def needs_input(args: dict, ctx: ToolContext) -> dict:
    result = ctx.elicit_input({"mode": "form", "message": "name?"})
    return {"content": [{"type": "text", "text": f"got {result.get('action')}"}]}

  server.register_tool("needs_input", needs_input)
  return server


@pytest.fixture(scope="module", autouse=True)
def upstream():
  handler = create_asgi_mcp_handler(_build_server())

  async def mcp(request: Request) -> Response:
    return await handler(request)

  asgi = Starlette(routes=[Route("/mcp", mcp, methods=["GET", "POST", "OPTIONS"])])
  config = uvicorn.Config(asgi, host="127.0.0.1", port=_SERVER_PORT, log_level="warning")
  server = uvicorn.Server(config)
  thread = threading.Thread(target=server.run, daemon=True)
  thread.start()
  for _ in range(100):
    try:
      httpx.post(f"http://127.0.0.1:{_SERVER_PORT}/mcp", timeout=1)
      break
    except httpx.HTTPError:
      time.sleep(0.05)
  yield
  server.should_exit = True
  thread.join(timeout=5)


def test_health():
  body = tc.get("/health").json()
  assert body["status"] == "ok"
  assert body["sampling"] in ("mock", "deepseek")


def test_status_connected():
  body = tc.get("/api/status").json()
  assert body["connected"] is True
  assert body["negotiatedVersion"] == "2026-07-28"
  assert body["serverInfo"]["name"] == "upstream"
  assert body["serverUrl"].endswith("/mcp")
  assert "elicitation" in body["clientCapabilities"]


def test_connect_and_discover():
  assert tc.post("/api/connect").json()["ok"] is True
  assert tc.get("/api/discover").json()["ok"] is True


def test_tools_and_call():
  body = tc.get("/api/tools").json()
  assert body["ok"] is True
  assert "echo" in {t["name"] for t in body["result"]["tools"]}
  call = tc.post("/api/tools/call", json={"name": "echo", "arguments": {"text": "hi"}}).json()
  assert call["ok"] is True
  assert call["result"]["content"][0]["text"] == "hi"


def test_unknown_tool_error_shape():
  body = tc.post("/api/tools/call", json={"name": "nope", "arguments": {}}).json()
  assert body["ok"] is False
  assert "error" in body and body["error"]["code"] == -32602


def test_roots_roundtrip():
  assert tc.get("/api/roots").json() == {"roots": []} or "roots" in tc.get("/api/roots").json()
  tc.post("/api/roots", json={"roots": [{"uri": "file:///x", "name": "x"}]})
  assert tc.get("/api/roots").json()["roots"][0]["uri"] == "file:///x"


def test_raw_ping():
  body = tc.post("/api/raw", json={"method": "ping", "params": {}}).json()
  assert body["ok"] is True


def test_elicitation_bridge():
  result: dict = {}

  def call():
    result["r"] = tc.post("/api/tools/call", json={"name": "needs_input", "arguments": {}}).json()

  t = threading.Thread(target=call)
  t.start()
  time.sleep(0.8)
  pending = tc.get("/api/elicitation/pending").json()["pending"]
  assert pending
  pid = pending[0]["id"]
  assert tc.post(f"/api/elicitation/{pid}/resolve", json={"action": "accept", "content": {}}).json()["ok"] is True
  t.join(timeout=10)
  assert result["r"]["ok"] is True
  assert "got accept" in result["r"]["result"]["content"][0]["text"]
