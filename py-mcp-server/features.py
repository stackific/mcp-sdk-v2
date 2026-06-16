"""The companion server's features — every server capability the TypeScript reference
server (``ts-mcp-server``) demonstrates, rebuilt on the Python SDK (``stackific-mcp``):
tools, resources, a resource template, a prompt, completion, logging + list-changed
notifications, plus the server→client capabilities exercised via the §11 multi-round-trip
loop (elicitation form+url, sampling, roots), streaming progress/cancellation,
subscriptions, caching, content blocks, the MCP Apps UI extension, and the Tasks
extension. This file declares NO protocol abstractions — it only registers features.
"""

from __future__ import annotations

import base64
import os
import random
import threading
import time
from datetime import datetime, timezone

from mcp.protocol.tools import validate_value_against_schema
from mcp.server import (
  UI_MIME_TYPE,
  InMemoryTaskStore,
  McpServer,
  ToolContext,
  ui_tool_result,
  with_cache_hints,
)

from counter_app import COUNTER_APP_HTML

# Tiny placeholder media for the content-blocks demo (1×1 PNG, empty WAV).
TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
TINY_WAV_B64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="


def _now_iso() -> str:
  return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validator(schema: object, value: object) -> tuple[bool, list[str]]:
  """Adapt the SDK's Draft 2020-12 validator to the McpServer ``(valid, errors)`` contract."""
  result = validate_value_against_schema(schema, value)
  return result.valid, result.errors


def build_companion_server() -> McpServer:
  """Construct the reference companion server with full TypeScript-parity features."""
  server = McpServer(
    {"name": "companion-mcp-server", "title": "Companion MCP Server", "version": "0.1.0"},
    {
      "logging": {},
      "completions": {},
      # listChanged is declared because `mutate_catalog` emits the matching
      # notifications/{tools,prompts,resources}/list_changed (§16.9/§17.7/§18.6).
      "tools": {"listChanged": True},
      "resources": {"listChanged": True},
      "prompts": {"listChanged": True},
      "tasks": {"list": {}, "cancel": {}, "requests": {"tools": {"call": {}}}},
    },
    value_validator=_validator,
  )

  task_store = InMemoryTaskStore()
  server.set_task_store(task_store)

  # ───────────────────────── Tools ─────────────────────────
  server.register_tool(
    "echo",
    lambda args, ctx: {"content": [{"type": "text", "text": str(args.get("text", ""))}]},
    title="Echo",
    description="The simplest possible tool: echoes text back.",
    input_schema={"type": "object", "properties": {"text": {"type": "string", "description": "Text to echo back"}}, "required": ["text"]},
    annotations={"readOnlyHint": True, "idempotentHint": True, "openWorldHint": False},
  )

  server.register_tool(
    "add",
    lambda args, ctx: {"content": [{"type": "text", "text": str(args["a"] + args["b"])}]},
    title="Add",
    description="Adds two numbers.",
    input_schema={"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
  )

  def get_weather(args: dict, ctx: ToolContext) -> dict:
    conditions = random.choice(["sunny", "cloudy", "rainy", "stormy"])
    structured = {"city": args["city"], "tempC": round((random.random() * 30 - 5) * 10) / 10, "conditions": conditions}
    import json

    return {"content": [{"type": "text", "text": json.dumps(structured, indent=2)}], "structuredContent": structured}

  server.register_tool(
    "get_weather",
    get_weather,
    title="Get Weather",
    description="Structured-output demo: returns structuredContent matching outputSchema.",
    input_schema={"type": "object", "properties": {"city": {"type": "string", "description": "City name"}}, "required": ["city"]},
    output_schema={
      "type": "object",
      "properties": {
        "city": {"type": "string"},
        "tempC": {"type": "number"},
        "conditions": {"type": "string", "enum": ["sunny", "cloudy", "rainy", "stormy"]},
      },
      "required": ["city", "tempC", "conditions"],
    },
  )

  def divide(args: dict, ctx: ToolContext) -> dict:
    if args["b"] == 0:
      return {
        "content": [{"type": "text", "text": "Cannot divide by zero. Reported as isError:true so the model can recover."}],
        "isError": True,
      }
    return {"content": [{"type": "text", "text": str(args["a"] / args["b"])}]}

  server.register_tool(
    "divide",
    divide,
    title="Divide (may error)",
    description="Demonstrates a TOOL error (isError:true) vs a protocol error.",
    input_schema={"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
    annotations={"readOnlyHint": True, "idempotentHint": True},
  )

  def count_with_logs(args: dict, ctx: ToolContext) -> dict:
    count = int(args.get("count", 5))
    interval_ms = int(args.get("intervalMs", 500))
    for i in range(1, count + 1):
      ctx.log("info", f"tick {i}/{count} at {_now_iso()}")
      time.sleep(interval_ms / 1000)
    return {"content": [{"type": "text", "text": f"Done. Sent {count} log notifications."}]}

  server.register_tool(
    "count_with_logs",
    count_with_logs,
    title="Count (streams log notifications)",
    description="Streams notifications/message while it runs — out-of-band notifications on the wire.",
    input_schema={
      "type": "object",
      "properties": {
        "count": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5, "description": "How many ticks"},
        "intervalMs": {"type": "integer", "minimum": 50, "maximum": 2000, "default": 500, "description": "Delay between ticks"},
      },
    },
  )

  # Elicitation (server→client via the §11 input_required loop).
  def register_user(args: dict, ctx: ToolContext) -> dict:
    import json

    result = ctx.elicit_input(
      {
        "mode": "form",
        "message": "Please provide your registration details:",
        "requestedSchema": {
          "type": "object",
          "properties": {
            "username": {"type": "string", "title": "Username", "minLength": 3, "maxLength": 20},
            "email": {"type": "string", "title": "Email", "format": "email"},
            "newsletter": {"type": "boolean", "title": "Subscribe to newsletter?", "default": False},
          },
          "required": ["username", "email"],
        },
      }
    )
    if result.get("action") == "accept" and result.get("content"):
      return {"content": [{"type": "text", "text": f"Registered:\n{json.dumps(result['content'], indent=2)}"}]}
    return {"content": [{"type": "text", "text": f"User chose to {result.get('action')} the form."}]}

  server.register_tool(
    "register_user",
    register_user,
    title="Register User (form elicitation)",
    description="Server requests user input via FORM elicitation.",
  )

  def confirm_purchase(args: dict, ctx: ToolContext) -> dict:
    frontend = os.environ.get("FRONTEND_URL", "http://localhost:8000")
    elicitation_id = f"purchase-{int(time.time() * 1000)}"
    result = ctx.elicit_input(
      {
        "mode": "url",
        "message": "Please confirm your purchase in the opened page.",
        "elicitationId": elicitation_id,
        "url": f"{frontend}/elicit/{elicitation_id}",
      }
    )
    return {"content": [{"type": "text", "text": f"URL elicitation result: {result.get('action')} (id={elicitation_id})."}]}

  server.register_tool(
    "confirm_purchase",
    confirm_purchase,
    title="Confirm Purchase (URL elicitation)",
    description="Server requests confirmation via URL elicitation.",
  )

  # Sampling (server borrows the client's model via the §11 loop).
  def summarize(args: dict, ctx: ToolContext) -> dict:
    import json

    message = ctx.create_message(
      {
        "messages": [{"role": "user", "content": {"type": "text", "text": f"Summarize in one sentence:\n{args['text']}"}}],
        "maxTokens": 200,
      }
    )
    content = message.get("content") if isinstance(message, dict) else None
    out = content.get("text") if isinstance(content, dict) and content.get("type") == "text" else json.dumps(content)
    return {"content": [{"type": "text", "text": f'Model "{message.get("model")}" replied:\n{out}'}]}

  server.register_tool(
    "summarize",
    summarize,
    title="Summarize (sampling)",
    description="Server asks the CLIENT to run its model (sampling/createMessage).",
    input_schema={"type": "object", "properties": {"text": {"type": "string", "description": "Text to summarize"}}, "required": ["text"]},
  )

  # Roots (server asks the client for its workspace).
  def show_roots(args: dict, ctx: ToolContext) -> dict:
    import json

    result = ctx.list_roots()
    return {"content": [{"type": "text", "text": f"Client roots:\n{json.dumps(result.get('roots'), indent=2)}"}]}

  server.register_tool(
    "show_roots",
    show_roots,
    title="Show Roots",
    description="Server requests the client roots list (roots/list).",
  )

  # Streaming + cooperative cancellation.
  def slow_count(args: dict, ctx: ToolContext) -> dict:
    to = int(args.get("to", 12))
    interval_ms = int(args.get("intervalMs", 600))
    i = 0
    while i < to:
      if ctx.signal.aborted:
        break
      ctx.log("info", f"count {i + 1}/{to}")
      if ctx.progress_token is not None:
        ctx.notify(
          {"method": "notifications/progress", "params": {"progressToken": ctx.progress_token, "progress": i + 1, "total": to, "message": f"count {i + 1}/{to}"}}
        )
      # Interruptible sleep: returns early if the request is cancelled meanwhile.
      ctx.signal.wait(interval_ms / 1000)
      i += 1
    cancelled = ctx.signal.aborted
    return {"content": [{"type": "text", "text": f"Cancelled at {i}/{to}." if cancelled else f"Counted to {to}."}]}

  server.register_tool(
    "slow_count",
    slow_count,
    title="Slow Count (cancellable)",
    description="Counts slowly, streams a log + progress per tick, stops early when cancelled.",
    input_schema={
      "type": "object",
      "properties": {
        "to": {"type": "integer", "minimum": 1, "maximum": 50, "default": 12},
        "intervalMs": {"type": "integer", "minimum": 50, "maximum": 2000, "default": 600},
      },
    },
  )

  # Subscriptions: list-changed & resource-updated notifications.
  def mutate_catalog(args: dict, ctx: ToolContext) -> dict:
    # Fan the change notifications out to active subscription streams (§10.5/§10.6).
    ctx.notify_subscribers({"method": "notifications/tools/list_changed"})
    ctx.notify_subscribers({"method": "notifications/prompts/list_changed"})
    ctx.notify_subscribers({"method": "notifications/resources/list_changed"})
    ctx.notify_subscribers({"method": "notifications/resources/updated", "params": {"uri": "docs://readme"}})
    # Also emit on this request's own stream so the Notifications page (no subscription) sees them.
    ctx.send_tool_list_changed()
    ctx.send_prompt_list_changed()
    ctx.send_resource_list_changed()
    ctx.send_resource_updated({"uri": "docs://readme"})
    return {"content": [{"type": "text", "text": "Emitted list_changed + resources/updated to subscribers and on this stream."}]}

  server.register_tool(
    "mutate_catalog",
    mutate_catalog,
    title="Mutate Catalog",
    description="Fires tools/prompts/resources list_changed and resources/updated so a subscriber re-fetches.",
    annotations={"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True},
  )

  # Pagination: opaque cursor / nextCursor.
  catalog = [{"id": i + 1, "name": f"item-{str(i + 1).zfill(2)}"} for i in range(23)]
  page_size = 5

  def list_catalog(args: dict, ctx: ToolContext) -> dict:
    import json

    cursor = args.get("cursor")
    offset = 0
    if isinstance(cursor, str) and cursor:
      try:
        offset = int(base64.b64decode(cursor.encode("ascii")).decode("ascii"))
      except (ValueError, TypeError):
        offset = 0
    items = catalog[offset : offset + page_size]
    next_offset = offset + page_size
    structured: dict = {"items": items, "total": len(catalog)}
    if next_offset < len(catalog):
      structured["nextCursor"] = base64.b64encode(str(next_offset).encode("ascii")).decode("ascii")
    return {"content": [{"type": "text", "text": json.dumps(structured, indent=2)}], "structuredContent": structured}

  server.register_tool(
    "list_catalog",
    list_catalog,
    title="List Catalog (paginated)",
    description="Returns one opaque-cursor page at a time; pass nextCursor to continue.",
    input_schema={"type": "object", "properties": {"cursor": {"type": "string", "description": "Opaque cursor from a previous page"}}},
    output_schema={
      "type": "object",
      "properties": {
        "items": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "number"}, "name": {"type": "string"}}}},
        "nextCursor": {"type": "string"},
        "total": {"type": "number"},
      },
      "required": ["items", "total"],
    },
  )

  # Caching: top-level result cache hints (ttlMs + cacheScope, §13.4).
  quote_counter = {"n": 0}
  quotes = ["Make it work, then make it right.", "Cache invalidation is hard.", "Premature optimization is the root of all evil."]

  def cached_quote(args: dict, ctx: ToolContext) -> dict:
    quote_counter["n"] += 1
    n = quote_counter["n"]
    return with_cache_hints(
      {
        "content": [{"type": "text", "text": f"#{n}: {quotes[n % len(quotes)]}"}],
        "_meta": {"generatedAt": _now_iso(), "invocation": n},
      },
      ttl_ms=60000,
      cache_scope="private",
    )

  server.register_tool(
    "cached_quote",
    cached_quote,
    title="Cached Quote",
    description="Returns a result carrying top-level cache hints (ttlMs + cacheScope).",
  )

  # Tracing: echo the W3C trace context from request _meta.
  def echo_trace(args: dict, ctx: ToolContext) -> dict:
    import json

    return {"content": [{"type": "text", "text": f"Server received _meta:\n{json.dumps(ctx.meta or {}, indent=2)}"}], "_meta": {"echoed": ctx.meta or {}}}

  server.register_tool(
    "echo_trace",
    echo_trace,
    title="Echo Trace Context",
    description="Echoes back the _meta the server received (incl. traceparent/tracestate).",
  )

  # Content blocks: every ContentBlock kind in one result.
  def content_gallery(args: dict, ctx: ToolContext) -> dict:
    return {
      "content": [
        {"type": "text", "text": "A tool result can mix block kinds: an image, audio, an embedded resource, and a resource link."},
        {"type": "image", "data": TINY_PNG_B64, "mimeType": "image/png"},
        {"type": "audio", "data": TINY_WAV_B64, "mimeType": "audio/wav"},
        {"type": "resource", "resource": {"uri": "docs://readme", "mimeType": "text/markdown", "text": "# Embedded resource\nAn inline resource block carried directly in the result."}},
        {"type": "resource_link", "uri": "weather://oslo/current", "name": "Oslo weather", "mimeType": "application/json"},
      ]
    }

  server.register_tool(
    "content_gallery",
    content_gallery,
    title="Content Gallery",
    description="Returns text, image, audio, an embedded resource, and a resource_link.",
  )

  # MCP Apps (UI extension): a ui:// resource + a launcher tool.
  server.register_resource(
    "counter-app",
    "ui://counter",
    lambda uri: {"contents": [{"uri": uri, "mimeType": UI_MIME_TYPE, "text": COUNTER_APP_HTML}]},
    title="Counter App (MCP Apps UI)",
    description="An interactive UI resource, rendered sandboxed by the host.",
    mime_type=UI_MIME_TYPE,
  )
  server.register_tool(
    "open_counter_app",
    lambda args, ctx: ui_tool_result(
      "ui://counter", COUNTER_APP_HTML, text="Launching the Counter app (ui://counter). The host renders it sandboxed."
    ),
    title="Open Counter App (MCP Apps)",
    description="Launches an MCP App: returns an embedded ui:// resource the host renders sandboxed.",
  )

  # Tasks extension: augmented call → handle immediately, work in background, fetch via tasks/get.
  def long_job(args: dict, ctx: ToolContext) -> dict:
    steps = int(args.get("steps", 4))
    label = str(args.get("label", "report"))
    task = task_store.create_task(ttl_ms=ctx.task_ttl_ms or 300000)
    task_id = task["taskId"]

    def status_of() -> str | None:
      try:
        return task_store.get(task_id)["status"]
      except Exception:  # noqa: BLE001 — expired/gone task reads defensively
        return None

    def work() -> None:
      try:
        for i in range(1, steps + 1):
          time.sleep(0.5)
          # The client may have cancelled (tasks/cancel) while we worked; stop quietly (§25.5).
          if status_of() != "working":
            return
          task_store.update_status(task_id, "working", f"step {i}/{steps}")
        if status_of() != "working":
          return
        task_store.store_result(
          task_id,
          {"content": [{"type": "text", "text": f'Job "{label}" completed {steps} steps.'}], "structuredContent": {"label": label, "steps": steps, "finishedAt": _now_iso()}},
        )
      except Exception as exc:  # noqa: BLE001 — record a failure only if still live
        if status_of() == "working":
          task_store.update_status(task_id, "failed", f"job failed: {exc}")

    threading.Thread(target=work, daemon=True).start()
    return {"task": task}

  server.register_tool(
    "long_job",
    long_job,
    title="Long Job (task)",
    description="Runs as a task: returns a handle immediately, works through N steps, then exposes the result via tasks/get.",
    input_schema={
      "type": "object",
      "properties": {
        "steps": {"type": "integer", "minimum": 1, "maximum": 8, "default": 4, "description": "How many background steps"},
        "label": {"type": "string", "default": "report", "description": "A label for the job"},
      },
    },
    execution={"taskSupport": "required"},
  )

  # ───────────── Resources, templates, prompts ─────────────
  server.register_resource(
    "readme",
    "docs://readme",
    lambda uri: {"contents": [{"uri": uri, "mimeType": "text/markdown", "text": "# Companion Server\n\nThis is a static MCP resource served over Streamable HTTP."}]},
    title="Readme",
    description="A static text resource.",
    mime_type="text/markdown",
  )

  import json as _json

  cities = ["oslo", "tokyo", "cairo", "lima", "quito", "osaka"]
  server.register_resource_template(
    "city-weather",
    "weather://{city}/current",
    lambda uri, variables: {"contents": [{"uri": uri, "mimeType": "application/json", "text": _json.dumps({"city": variables["city"], "tempC": 21, "conditions": "sunny"}, indent=2)}]},
    title="City Weather (template)",
    description="A templated resource with argument completion.",
    mime_type="application/json",
    complete={"city": lambda v: [c for c in cities if c.startswith(v.lower())]},
  )

  server.register_prompt(
    "greeting",
    lambda args: {"messages": [{"role": "user", "content": {"type": "text", "text": f"Greet {args.get('name')} warmly in {args.get('language', 'english')}."}}]},
    title="Greeting",
    description="A reusable, user-invoked prompt with a completable argument.",
    arguments=[
      {"name": "name", "required": True, "description": "Who to greet"},
      {"name": "language", "description": "Language", "complete": lambda v: [lng for lng in ("english", "spanish", "norwegian", "japanese") if lng.startswith(v.lower())]},
    ],
  )

  return server
