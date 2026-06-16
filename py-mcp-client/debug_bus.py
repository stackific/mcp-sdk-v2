"""The wire-debug frame bus.

Every JSON-RPC frame the MCP client sends/receives, plus lifecycle and bridge events,
flow through this bus. The ``/debug/stream`` SSE endpoint relays them to the frontend so
each capability page can show what is happening on the wire. Thread-safe: frames are
emitted from the SDK transport's request/subscription threads while the SSE relay runs
on the event loop.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

#: The Frame shape the frontend expects: seq, ts, dir, kind, method?, id?, summary?, payload?, trace?.
FrameListener = Callable[[dict], None]


class DebugBus:
  """A tiny thread-safe event bus; the ``/debug/stream`` endpoint subscribes via on/off."""

  def __init__(self) -> None:
    self._seq = 0
    self._listeners: set[FrameListener] = set()
    self._lock = threading.Lock()

  def on(self, listener: FrameListener) -> None:
    with self._lock:
      self._listeners.add(listener)

  def off(self, listener: FrameListener) -> None:
    with self._lock:
      self._listeners.discard(listener)

  def emit_frame(self, partial: dict) -> dict:
    """Stamp ``seq`` + ``ts`` and fan the frame out to every registered listener."""
    with self._lock:
      self._seq += 1
      frame = {**partial, "seq": self._seq, "ts": int(time.time() * 1000)}
      listeners = list(self._listeners)
    for listener in listeners:
      try:
        listener(frame)
      except Exception:  # noqa: BLE001 — a listener must not break the bus
        pass
    return frame


bus = DebugBus()
