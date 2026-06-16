"""In-memory conformance test-kit for ``mcp``.

A small harness that wires a :class:`~mcp.client.client.Client` directly to an
:class:`~mcp.server.server.McpServer` with **no real transport** — no sockets, no
subprocess, no framing — so a client can drive a server fully in-process. It is the
Python counterpart of the TypeScript SDK's ``connectInMemory`` test-kit
(``ts-sdk/src/testing/in-memory.ts``).

The single moving part is :class:`~mcp.testing.in_memory.InMemoryClientTransport`, a
:class:`~mcp.client.transport.ClientTransport` whose :meth:`request` hands each
already-parsed JSON-RPC request straight to :func:`~mcp.server.runtime.process_message`
and returns the response dict. Because the Python client is synchronous, this dispatch
is a plain in-process function call — the entire request/response exchange runs in one
call stack with deterministic ordering, which is exactly what tests and spec-vector
conformance suites want.

Use :func:`~mcp.testing.in_memory.connect_in_memory` to obtain a ready-to-drive client,
or construct :class:`~mcp.testing.in_memory.InMemoryClientTransport` yourself when you
need to pass the client extra options.
"""

from __future__ import annotations

from mcp.testing.in_memory import InMemoryClientTransport, connect_in_memory

__all__ = ["InMemoryClientTransport", "connect_in_memory"]
