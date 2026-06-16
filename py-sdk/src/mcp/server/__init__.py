"""MCP server runtime: the stateless dispatcher, registration API, the
transport-agnostic request processor, and the Streamable HTTP handlers.

Re-exports the public surface so embedders import from a single module:
``from mcp.server import McpServer, create_asgi_mcp_handler, InMemoryTaskStore, …``.
"""

from mcp.server.asgi import AuthGate, create_asgi_mcp_handler
from mcp.server.auth import bearer_auth_gate, build_protected_resource_metadata
from mcp.server.caching import with_cache_hints
from mcp.server.http import HttpResponse, create_mcp_request_handler
from mcp.server.runtime import process_message
from mcp.server.server import (
  LOG_LEVELS,
  TASK_RESULT_TYPE,
  CancelSignal,
  InputRequired,
  McpServer,
  ServerError,
  ServerRequestContext,
  ToolContext,
  ValueValidator,
)
from mcp.server.tasks import InMemoryTaskStore
from mcp.server.ui import (
  TOOL_UI_META_KEY,
  UI_MIME_TYPE,
  UI_URI_SCHEME,
  is_ui_resource_uri,
  ui_resource,
  ui_tool_result,
)

__all__ = [
  "McpServer",
  "ServerError",
  "ServerRequestContext",
  "ToolContext",
  "ValueValidator",
  "CancelSignal",
  "InputRequired",
  "LOG_LEVELS",
  "TASK_RESULT_TYPE",
  "process_message",
  "HttpResponse",
  "create_mcp_request_handler",
  "create_asgi_mcp_handler",
  "AuthGate",
  "InMemoryTaskStore",
  "bearer_auth_gate",
  "build_protected_resource_metadata",
  "with_cache_hints",
  "UI_MIME_TYPE",
  "UI_URI_SCHEME",
  "TOOL_UI_META_KEY",
  "is_ui_resource_uri",
  "ui_resource",
  "ui_tool_result",
]
