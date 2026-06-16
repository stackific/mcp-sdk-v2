"""S7 (stdio binding) — serve an :class:`~mcp.server.server.McpServer` over stdio (§8).

The TypeScript original (``ts-sdk/src/server/stdio.ts``) wires an ``McpServer`` to a
``Transport`` and dispatches each inbound message, writing responses back on the same
channel. The Python port keeps that shape but specialises it to the stdio framing of §8
(newline-delimited UTF-8 JSON-RPC, R-8.2-*) and the synchronous, stateless
:func:`~mcp.server.runtime.process_message` dispatcher:

* read newline-delimited JSON-RPC messages from a provided **input** text stream
  (defaults to :data:`sys.stdin`);
* dispatch each via :func:`process_message`, which classifies the message, runs a
  request through the :class:`McpServer`, and returns the JSON-RPC response — or
  ``None`` for a notification / stray response, which produces no reply (R-8.3-c);
* serialise each response as one compact UTF-8 JSON line terminated by a single ``\\n``
  and write it to a provided **output** text stream (defaults to :data:`sys.stdout`),
  flushing so the client sees it promptly.

Testability: the input/output streams are injected, so a test drives the loop with
:class:`io.StringIO` rather than the real process stdin/stdout. The loop never hard-
requires :data:`sys.stdin`/:data:`sys.stdout`; they are merely the defaults.

A malformed line yields the ``-32600`` *Invalid Request* envelope with a ``null`` id
(built inside :func:`process_message`, since the originating id cannot be trusted), so a
host that wishes to answer a recoverable parse error still observes the line — the loop
itself never crashes or tears down on bad input (R-8.5-d, R-8.5-h).
"""

from __future__ import annotations

import json
import sys
from typing import TYPE_CHECKING, Callable, TextIO

from mcp.server.runtime import process_message

if TYPE_CHECKING:  # pragma: no cover — import only for type checking
  from mcp.server.server import McpServer


def _blank(line: str) -> bool:
  """Return ``True`` for an empty or whitespace-only line (ignored, not malformed).

  Mirrors the stdio transport's blank-line rule (R-8.2-h): such a line is not a
  JSON-RPC message and is skipped rather than reported as a parse error.
  """
  return line.strip() == ""


def write_message(out: TextIO, message: dict) -> None:
  """Serialise ``message`` as one newline-framed UTF-8 JSON line and flush.

  ``json.dumps`` escapes any embedded newline inside a string, so the produced line
  never contains a raw ``\\n`` other than the single terminator — keeping newline
  framing unambiguous (R-8.2-a – R-8.2-d). ``ensure_ascii=False`` emits real UTF-8 for
  non-ASCII characters (R-8.2-a); ``allow_nan=False`` keeps a non-finite number off the
  wire — JSON has no ``NaN``/``Infinity`` (R-7.1-b).
  """
  out.write(json.dumps(message, ensure_ascii=False, allow_nan=False) + "\n")
  out.flush()


def process_line(server: "McpServer", line: str, out: TextIO) -> dict | None:
  """Dispatch one raw input line and write its response (if any).

  Strips a trailing ``\\r`` so a ``\\r\\n`` terminator decodes like ``\\n`` (R-8.2-f,
  R-8.2-g), ignores a blank line (R-8.2-h), then:

  * parses the line as JSON — a parse failure is handed to :func:`process_message` as a
    non-message object so it returns the ``-32600`` *Invalid Request* envelope with a
    ``null`` id (the line is malformed; no id can be trusted, R-8.5-g);
  * otherwise dispatches the parsed value via :func:`process_message`. A request yields
    a response that is written to ``out``; a notification (or stray response) yields
    ``None`` and nothing is written (R-8.3-c).

  Server→client notifications a tool emits during the request ride the same ``out``
  channel via the ``notify`` sink threaded into :func:`process_message`.

  :returns: the response dict that was written, or ``None`` when no reply was produced.
  """
  line = line.rstrip("\r")
  if _blank(line):
    return None

  def _notify(notification: dict) -> None:
    # A tool-emitted notification is a server→client notification: frame + write it on
    # the same stdout channel, never as a request. (§8 server role)
    write_message(out, {"jsonrpc": "2.0", **notification})

  try:
    raw: object = json.loads(line)
  except json.JSONDecodeError:
    # A line that is not even valid JSON is still a malformed *message*: route it
    # through process_message so the canonical Invalid Request envelope is produced.
    raw = line

  response = process_message(server, raw, notify=_notify)
  if response is not None:
    write_message(out, response)
  return response


def serve_stdio(
  server: "McpServer",
  *,
  input_stream: TextIO | None = None,
  output_stream: TextIO | None = None,
  should_continue: Callable[[], bool] | None = None,
) -> None:
  """Serve ``server`` over newline-delimited JSON-RPC on stdio until input ends (§8).

  Reads one line at a time from ``input_stream`` (defaults to :data:`sys.stdin`),
  dispatches each via :func:`process_line`, and writes any response to ``output_stream``
  (defaults to :data:`sys.stdout`). The loop runs until the input stream reaches EOF —
  the graceful-shutdown signal for a stdio server, after which it SHOULD exit promptly
  (R-8.6.2-b) — or until ``should_continue`` (when supplied) returns ``False``.

  The loop is deliberately tolerant: a malformed line never crashes it; it produces the
  appropriate error envelope (or silence) and reads on (R-8.5-d, R-8.5-h).

  :param input_stream: text stream of inbound lines; injected in tests via
    :class:`io.StringIO`. Defaults to :data:`sys.stdin`.
  :param output_stream: text stream responses are written to; injected in tests.
    Defaults to :data:`sys.stdout`.
  :param should_continue: optional predicate checked before reading each line; return
    ``False`` to stop the loop early (e.g. on a server-initiated shutdown).
  """
  src = input_stream if input_stream is not None else sys.stdin
  out = output_stream if output_stream is not None else sys.stdout

  while should_continue is None or should_continue():
    line = src.readline()
    if line == "":
      # EOF: the input stream ended → graceful shutdown. (R-8.6.2-b)
      break
    process_line(server, line, out)
