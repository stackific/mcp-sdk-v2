"""Bridges a server-initiated elicitation (which the MCP client receives) to the user
sitting in the browser.

The client's ``elicitation/create`` handler parks a pending entry here and blocks; the
frontend renders the form / opens the URL, then POSTs the user's answer to
``/api/elicitation/:id/resolve``, which fulfills the pending entry and unblocks the
handler. Thread-safe: the handler blocks on a request thread while the resolve arrives
on another.
"""

from __future__ import annotations

import threading


class _Pending:
  __slots__ = ("event", "mode", "result")

  def __init__(self, mode: str) -> None:
    self.event = threading.Event()
    self.mode = mode
    self.result: dict = {"action": "cancel"}


_pending: dict[str, _Pending] = {}
_lock = threading.Lock()


def create_pending(pending_id: str, mode: str) -> _Pending:
  """Register a pending elicitation and return it (the caller blocks on ``.event``)."""
  pending = _Pending(mode)
  with _lock:
    _pending[pending_id] = pending
  return pending


def wait_for(pending: _Pending, timeout: float = 300.0) -> dict:
  """Block until the user resolves the elicitation (or ``timeout``); return ``{action, content?}``."""
  if not pending.event.wait(timeout):
    return {"action": "cancel"}
  return pending.result


def resolve_pending(pending_id: str, result: dict) -> bool:
  """Fulfill a pending elicitation with the user's answer. Returns ``False`` if unknown."""
  with _lock:
    pending = _pending.pop(pending_id, None)
  if pending is None:
    return False
  pending.result = result
  pending.event.set()
  return True


def list_pending() -> list[dict]:
  """Return the currently-pending elicitations as ``[{id, mode}]``."""
  with _lock:
    return [{"id": pid, "mode": p.mode} for pid, p in _pending.items()]
