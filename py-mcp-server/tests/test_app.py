"""End-to-end tests for the real py-mcp-server app, driven by the SDK client over a live
uvicorn server (a real socket), so the full Streamable HTTP wire path is exercised —
including the streaming SSE response shape, the §11 multi-round-trip loop, the Tasks
extension, subscriptions, and cooperative cancellation. (A TestClient cannot faithfully
drive the lazy-commit SSE + background-thread tool model, so we use a real server.)
"""

from __future__ import annotations

import socket
import threading
import time

import httpx
import pytest
import uvicorn

from mcp.client import Client, StreamableHttpClientTransport

from main import app

CAPS = {"elicitation": {"form": {}, "url": {}}, "sampling": {}, "roots": {}, "tasks": {}}


def _free_port() -> int:
  s = socket.socket()
  s.bind(("127.0.0.1", 0))
  port = s.getsockname()[1]
  s.close()
  return port


@pytest.fixture(scope="module")
def base_url():
  port = _free_port()
  config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
  server = uvicorn.Server(config)
  thread = threading.Thread(target=server.run, daemon=True)
  thread.start()
  url = f"http://127.0.0.1:{port}"
  for _ in range(100):
    try:
      if httpx.get(f"{url}/health", timeout=1).status_code == 200:
        break
    except httpx.HTTPError:
      time.sleep(0.05)
  else:
    raise RuntimeError("server did not start")
  yield url
  server.should_exit = True
  thread.join(timeout=5)


def make_client(base_url: str) -> Client:
  c = Client(StreamableHttpClientTransport(f"{base_url}/mcp"), {"name": "test", "version": "1"}, capabilities=CAPS)
  c.set_request_handler("elicitation/create", lambda p: {"action": "accept", "content": {"username": "ada", "email": "a@x.io"}})
  c.set_request_handler("sampling/createMessage", lambda p: {"role": "assistant", "content": {"type": "text", "text": "ok"}, "model": "mock", "stopReason": "endTurn"})
  c.set_request_handler("roots/list", lambda p: {"roots": [{"uri": "file:///ws", "name": "ws"}]})
  c.discover()
  return c


def test_health(base_url):
  assert httpx.get(f"{base_url}/health").json()["sdk"] == "stackific-mcp"


def test_discover_and_tools(base_url):
  c = make_client(base_url)
  assert c.server_info["name"] == "companion-mcp-server"
  assert c.negotiated_version == "2026-07-28"
  names = {t["name"] for t in c.list_tools()["tools"]}
  assert len(names) == 17
  assert {"echo", "add", "long_job", "mutate_catalog", "open_counter_app", "slow_count"} <= names


def test_basic_tools(base_url):
  c = make_client(base_url)
  assert c.call_tool("echo", {"text": "hi"})["content"][0]["text"] == "hi"
  assert c.call_tool("add", {"a": 2, "b": 3})["content"][0]["text"] == "5"
  weather = c.call_tool("get_weather", {"city": "Oslo"})
  assert weather["structuredContent"]["city"] == "Oslo"
  divide = c.call_tool("divide", {"a": 1, "b": 0})
  assert divide["isError"] is True


def test_mrtr_elicitation_sampling_roots(base_url):
  c = make_client(base_url)
  assert "Registered" in c.call_tool("register_user", {})["content"][0]["text"]
  assert 'Model "mock"' in c.call_tool("summarize", {"text": "hello world"})["content"][0]["text"]
  assert "file:///ws" in c.call_tool("show_roots", {})["content"][0]["text"]


def test_streaming_notifications(base_url):
  c = make_client(base_url)
  recv = []
  c.set_frame_listener(lambda d, f: recv.append(f) if d == "recv" else None)
  result = c.call_tool("count_with_logs", {"count": 3, "intervalMs": 50})
  assert "Sent 3 log notifications" in result["content"][0]["text"]
  logs = [f for f in recv if f.get("method") == "notifications/message"]
  assert len(logs) == 3


def test_cancellation(base_url):
  c = make_client(base_url)
  out = {}

  def call():
    out["r"] = c.call_tool_cancellable("slow_count", {"to": 20, "intervalMs": 200}, "cx")

  t = threading.Thread(target=call)
  t.start()
  time.sleep(1.0)
  assert c.cancel("cx") is True
  t.join(timeout=10)
  assert "Cancelled at" in out["r"]["content"][0]["text"]


def test_tasks(base_url):
  c = make_client(base_url)
  task = c.create_task("long_job", {"steps": 2, "label": "demo"}, ttl_ms=60000)
  assert task["resultType"] == "task"
  assert task["status"] == "working"
  task_id = task["taskId"]
  detailed = task
  for _ in range(40):
    detailed = c.get_task(task_id)
    if detailed["status"] in ("completed", "failed", "cancelled"):
      break
    time.sleep(0.2)
  assert detailed["status"] == "completed"
  assert "completed 2 steps" in detailed["result"]["content"][0]["text"]


def test_subscriptions(base_url):
  c = make_client(base_url)
  recv = []
  c.set_frame_listener(lambda d, f: recv.append(f.get("method")) if d == "recv" else None)
  handle = c.subscribe({"toolsListChanged": True, "promptsListChanged": True})
  # subscribe() is non-blocking and returns a SubscriptionHandle; the honored filter
  # lands once the server's acknowledgement arrives over the listen stream (the sync
  # analogue of TS's awaited subscribe()).
  assert handle.wait_acknowledged(timeout=5.0)
  assert handle.acknowledged_filter == {"toolsListChanged": True, "promptsListChanged": True}
  mutator = make_client(base_url)
  mutator.call_tool("mutate_catalog", {})
  time.sleep(0.6)
  assert "notifications/tools/list_changed" in recv
  assert "notifications/prompts/list_changed" in recv


def test_pagination_caching_content_ui(base_url):
  c = make_client(base_url)
  page1 = c.call_tool("list_catalog", {})["structuredContent"]
  assert len(page1["items"]) == 5 and "nextCursor" in page1
  page2 = c.call_tool("list_catalog", {"cursor": page1["nextCursor"]})["structuredContent"]
  assert page2["items"][0]["id"] == 6
  quote = c.call_tool("cached_quote", {})
  assert quote["ttlMs"] == 60000 and quote["cacheScope"] == "private"
  gallery = c.call_tool("content_gallery", {})
  kinds = {b["type"] for b in gallery["content"]}
  assert {"text", "image", "audio", "resource", "resource_link"} == kinds
  ui = c.call_tool("open_counter_app", {})
  assert ui["_meta"]["ui"]["resourceUri"] == "ui://counter"


def test_resources_prompts_completion(base_url):
  c = make_client(base_url)
  uris = {r["uri"] for r in c.list_resources()["resources"]}
  assert {"docs://readme", "ui://counter"} <= uris
  templates = c.list_resource_templates()["resourceTemplates"]
  assert templates[0]["uriTemplate"] == "weather://{city}/current"
  assert c.read_resource("docs://readme")["contents"][0]["mimeType"] == "text/markdown"
  assert "oslo" in c.read_resource("weather://oslo/current")["contents"][0]["text"]
  prompt = c.get_prompt("greeting", {"name": "Ada", "language": "spanish"})
  assert "spanish" in prompt["messages"][0]["content"]["text"]
  completion = c.complete({"type": "ref/prompt", "name": "greeting"}, {"name": "language", "value": "e"})
  assert "english" in completion["completion"]["values"]
