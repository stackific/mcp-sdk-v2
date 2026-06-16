"""Sampling — the client runs a model on the server's behalf (``sampling/createMessage``).

Routes to DeepSeek via its Anthropic-compatible endpoint when ``DEEPSEEK_API_KEY`` is set;
otherwise a deterministic mock so Sampling works before a key is configured.
"""

from __future__ import annotations

import httpx

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, HAS_KEY


def _content_to_text(content: object) -> str:
  blocks = content if isinstance(content, list) else [content] if content else []
  out = []
  for b in blocks:
    if isinstance(b, dict) and b.get("type") == "text" and isinstance(b.get("text"), str):
      out.append(b["text"])
    else:
      out.append(f"[{b.get('type', 'unknown') if isinstance(b, dict) else 'unknown'} content]")
  return "\n".join(out)


def _sample_with_deepseek(params: dict) -> dict:
  """DeepSeek via its Anthropic-compatible endpoint (the real path when a key is set)."""
  messages = [
    {"role": m.get("role", "user"), "content": _content_to_text(m.get("content"))}
    for m in params.get("messages", [])
  ]
  body = {"model": DEEPSEEK_MODEL, "max_tokens": params.get("maxTokens") or 512, "messages": messages}
  if params.get("systemPrompt"):
    body["system"] = params["systemPrompt"]
  resp = httpx.post(
    f"{DEEPSEEK_BASE_URL}/v1/messages",
    headers={"x-api-key": DEEPSEEK_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
    json=body,
    timeout=60.0,
  ).raise_for_status().json()
  text = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
  return {
    "role": "assistant",
    "content": {"type": "text", "text": text},
    "model": resp.get("model", DEEPSEEK_MODEL),
    "stopReason": resp.get("stop_reason") or "endTurn",
  }


def _sample_mock(params: dict) -> dict:
  """Deterministic stand-in so Sampling works before a key is configured."""
  last_user = next((m for m in reversed(params.get("messages", [])) if m.get("role") == "user"), None)
  said = " ".join(_content_to_text(last_user.get("content") if last_user else None).split())
  words = said.split(" ")
  gist = " ".join(words[:16])
  ellipsis = "…" if len(words) > 16 else ""
  return {
    "role": "assistant",
    "content": {
      "type": "text",
      "text": f"(mock model — set DEEPSEEK_API_KEY in py-mcp-client/.env for a real DeepSeek answer)\nIn short: {gist}{ellipsis}",
    },
    "model": "mock-deepseek",
    "stopReason": "endTurn",
  }


def sample(params: dict) -> dict:
  """Run sampling against DeepSeek (when keyed) or the deterministic mock."""
  if HAS_KEY:
    try:
      return _sample_with_deepseek(params)
    except Exception:  # noqa: BLE001 — fall back to the mock on any provider error
      return _sample_mock(params)
  return _sample_mock(params)
