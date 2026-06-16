"""Configuration for the Python MCP client host. Ports + URLs are owned by the root
Taskfile; these defaults match it so the app also runs standalone.
"""

from __future__ import annotations

import os


def _env(key: str, default: str) -> str:
  return os.environ.get(key, default)


PORT = int(_env("PY_MCP_CLIENT_PORT", "8102"))

# The app is MCP-server-agnostic: this points at any compliant server.
_SERVER_BASE = _env("PY_MCP_SERVER_URL", "http://localhost:8101").rstrip("/")
MCP_SERVER_URL = _SERVER_BASE if _SERVER_BASE.endswith("/mcp") else f"{_SERVER_BASE}/mcp"
AUTH_SERVER_URL = _env("PY_AUTH_SERVER_URL", "http://localhost:8103").rstrip("/")
FRONTEND_URL = _env("FRONTEND_URL", "http://localhost:8000").rstrip("/")

# Sampling routes to DeepSeek via its Anthropic-compatible endpoint; without a key it
# falls back to a deterministic mock so everything still runs.
DEEPSEEK_API_KEY = _env("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/anthropic")
DEEPSEEK_MODEL = _env("DEEPSEEK_MODEL", "deepseek-chat")
HAS_KEY = len(DEEPSEEK_API_KEY) > 0
