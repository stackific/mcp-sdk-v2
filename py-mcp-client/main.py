"""Python MCP client host (FastAPI) built on the SDK (``stackific-mcp``).

The real Python counterpart to ``ts-mcp-client``: it hosts an MCP client connected to
``py-mcp-server`` over Streamable HTTP, taps every JSON-RPC frame to ``/debug/stream``,
and exposes the companion frontend's full REST surface so every capability page drives a
real MCP request and shows what crosses the wire.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable

import uvicorn
from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from mcp.client import RequestError

from auth_flow import run_auth_flow
from config import DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, HAS_KEY, PORT
from debug_bus import bus
from elicitation import list_pending, resolve_pending
from mcp_client import (
  api,
  cancel,
  ensure_connected,
  get_roots,
  get_status,
  reconnect,
  set_roots,
)
from transport import transport_probe

log = logging.getLogger("py-mcp-client")

app = FastAPI(title="py-mcp-client")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"])


def run(fn: Callable[[], object]) -> dict:
  """Shape an MCP call into the frontend's ApiResult ({ok, result} / {ok, error}).

  A delivered JSON-RPC protocol error (:class:`RequestError`) is surfaced with its
  structured ``code`` + protocol ``message`` (server-provided fields the SPA renders).
  Any other failure is logged server-side and reported with a generic message, so no
  internal exception detail is exposed to the caller.
  """
  try:
    return {"ok": True, "result": fn()}
  except RequestError as exc:
    return {"ok": False, "error": {"message": exc.message, "code": exc.code, "data": exc.data}}
  except Exception:  # noqa: BLE001 — transport/other failure → generic, non-leaking error
    log.exception("client host request failed")
    return {"ok": False, "error": {"message": "Internal client host error"}}


@app.get("/health")
def health() -> dict:
  return {"status": "ok", "sampling": "deepseek" if HAS_KEY else "mock"}


@app.get("/info")
def info() -> dict:
  return {
    "name": "py-mcp-companion-backend",
    "sampling": {"provider": "deepseek (anthropic-compatible)" if HAS_KEY else "mock", "model": DEEPSEEK_MODEL if HAS_KEY else "mock-deepseek", "baseUrl": DEEPSEEK_BASE_URL, "keyPresent": HAS_KEY},
    "status": get_status(),
  }


# ── Live wire-debug stream — relays every JSON-RPC frame to the frontend ──
@app.get("/debug/stream")
async def debug_stream() -> StreamingResponse:
  loop = asyncio.get_running_loop()
  queue: asyncio.Queue = asyncio.Queue()

  def on_frame(frame: dict) -> None:
    loop.call_soon_threadsafe(queue.put_nowait, frame)

  def sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

  async def events():
    bus.on(on_frame)
    try:
      # Connect lazily off the event loop so the first status reflects the real connection.
      await asyncio.to_thread(ensure_connected)
      yield sse("status", get_status())
      while True:
        try:
          frame = await asyncio.wait_for(queue.get(), timeout=15.0)
          yield sse("frame", frame)
        except asyncio.TimeoutError:
          yield sse("ping", {})
    finally:
      bus.off(on_frame)

  return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


# ── Connection + discovery ──
@app.post("/api/connect")
def api_connect() -> dict:
  return run(lambda: (reconnect(), get_status())[1])


@app.get("/api/status")
def api_status() -> dict:
  ensure_connected()
  return get_status()


@app.get("/api/discover")
def api_discover() -> dict:
  return run(api.discover)


# ── Tools ──
@app.get("/api/tools")
def api_tools() -> dict:
  return run(api.list_tools)


# NOTE: every route that drives a (blocking, synchronous) SDK call is a plain ``def``
# so FastAPI runs it in a worker thread — never on the event loop. This is essential:
# the elicitation bridge and a cancellable call BLOCK their handler, and blocking the
# loop would freeze the whole host (e.g. /api/cancel could never run).
@app.post("/api/tools/call")
def api_tools_call(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool(body.get("name"), body.get("arguments") or {}))


@app.post("/api/tools/call-cancellable")
def api_tools_call_cancellable(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool_cancellable(body.get("name"), body.get("arguments") or {}, body.get("cancelId")))


@app.post("/api/cancel")
def api_cancel(body: dict = Body(default={})) -> dict:
  return {"ok": cancel(body.get("cancelId"))}


@app.post("/api/tools/call-traced")
def api_tools_call_traced(body: dict = Body(default={})) -> dict:
  return run(lambda: api.call_tool_with_meta(body.get("name"), body.get("arguments") or {}, body.get("_meta") or {}))


# ── Generic JSON-RPC passthrough ──
@app.post("/api/raw")
def api_raw(body: dict = Body(default={})) -> dict:
  return run(lambda: api.raw(body.get("method"), body.get("params") or {}))


# ── Subscriptions ──
@app.post("/api/subscribe")
def api_subscribe(body: dict = Body(default={})) -> dict:
  return run(lambda: api.subscribe(body.get("notifications") or {}))


# ── Tasks extension ──
@app.post("/api/tasks/create")
def api_tasks_create(body: dict = Body(default={})) -> dict:
  return run(lambda: api.create_task(body.get("name"), body.get("arguments") or {}, body.get("ttl")))


@app.post("/api/tasks/get")
def api_tasks_get(body: dict = Body(default={})) -> dict:
  return run(lambda: api.get_task(body.get("taskId")))


# ── Authorization ──
@app.post("/api/authorize/run")
def api_authorize_run() -> dict:
  return run(run_auth_flow)


# ── Transport probe ──
@app.get("/api/transport/probe")
def api_transport_probe() -> dict:
  return run(transport_probe)


# ── Resources ──
@app.get("/api/resources")
def api_resources() -> dict:
  return run(api.list_resources)


@app.get("/api/resource-templates")
def api_resource_templates() -> dict:
  return run(api.list_resource_templates)


@app.post("/api/resources/read")
def api_resources_read(body: dict = Body(default={})) -> dict:
  return run(lambda: api.read_resource(body.get("uri")))


# ── Prompts ──
@app.get("/api/prompts")
def api_prompts() -> dict:
  return run(api.list_prompts)


@app.post("/api/prompts/get")
def api_prompts_get(body: dict = Body(default={})) -> dict:
  return run(lambda: api.get_prompt(body.get("name"), body.get("arguments") or {}))


# ── Completion ──
@app.post("/api/complete")
def api_complete(body: dict = Body(default={})) -> dict:
  return run(lambda: api.complete(body.get("ref"), body.get("argument"), body.get("context")))


# ── Roots (the server calls roots/list on the client; the SPA configures them here) ──
@app.get("/api/roots")
def api_roots() -> dict:
  return {"roots": get_roots()}


@app.post("/api/roots")
def api_set_roots(body: dict = Body(default={})) -> dict:
  set_roots(body.get("roots") or [])
  return {"roots": get_roots()}


# ── Elicitation bridge ──
@app.get("/api/elicitation/pending")
def api_elicitation_pending() -> dict:
  return {"pending": list_pending()}


@app.post("/api/elicitation/{pending_id}/resolve")
def api_elicitation_resolve(pending_id: str, body: dict = Body(default={})) -> JSONResponse:
  return JSONResponse({"ok": resolve_pending(pending_id, body)})


if __name__ == "__main__":
  uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
