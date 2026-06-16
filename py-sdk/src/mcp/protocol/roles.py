"""Wire-level protocol endpoint roles (§1.1, §2.2).

MCP defines three *roles* (§1.1): **Host**, **Client**, and **Server**. Only two of
them — ``Client`` and ``Server`` — are JSON-RPC roles *on the wire*. The **Host** embeds
and coordinates one or more clients and owns user trust and consent decisions, but it is
*not* itself a JSON-RPC role on the wire (§2.2): it never sends or receives a JSON-RPC
message directly. It therefore does NOT appear in this enumeration.

The relationship among the wire roles is fixed (§1.1): a single host MAY run many clients
simultaneously; each client has a one-to-one relationship with exactly one server; and
servers are isolated from one another — a server neither communicates with another server
nor observes the full host conversation.

This module is the Python analogue of the TS SDK's ``McpRole`` constant. Conversation
participant roles (``"user"`` / ``"assistant"``, used by ``Annotations.audience`` and
prompt messages, §14.7) are an UNRELATED, closed enumeration that lives in
:mod:`mcp.types.role`; do not conflate the two.

Wire examples::

    McpRole.CLIENT == "client"
    McpRole.SERVER == "server"

(AC-01.1)
"""

from __future__ import annotations


# ─── §1.1 / §2.2 The two JSON-RPC wire roles ──────────────────────────────────

class McpRole:
  """The two JSON-RPC roles an endpoint may act in on the wire (§1.1, §2.2).

  Mirrors the TS SDK's ``McpRole`` ``as const`` object: a namespace of string
  constants whose *values* are the wire tokens callers compare a received role
  string against. The **Host** is deliberately absent — it is not a wire role
  (§2.2, R-1.1). (AC-01.1)
  """

  #: A protocol endpoint that initiates connections and issues requests. (§2.2)
  CLIENT = "client"
  #: A protocol endpoint that exposes capabilities and responds to requests. (§2.2)
  SERVER = "server"


#: The closed set of JSON-RPC wire-role values: exactly ``{"client", "server"}``.
#: The host is intentionally excluded — it is not a wire role (§2.2). (AC-01.1)
MCP_ROLES = frozenset({McpRole.CLIENT, McpRole.SERVER})


def is_mcp_role(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid wire role (``"client"`` or ``"server"``).

  The set is closed: ``"host"`` is NOT a wire role and yields ``False`` (§2.2). (AC-01.1)

  Wire roles are strings, so any non-string value (including unhashable ones such
  as ``list``/``dict``) is rejected before the set membership test — mirroring the
  TS ``typeof value === 'string'`` guard in ``isMcpRole``.
  """
  return isinstance(value, str) and value in MCP_ROLES


def peer_role(role: str) -> str:
  """Return the role of the *peer* at the opposite end of the connection (§2.2).

  From a client's standpoint the peer is a server, and vice versa — the relationship
  is symmetric and one-to-one (§1.1). (AC-01.1)

  :raises ValueError: when ``role`` is not a valid wire role.
  """
  if role == McpRole.CLIENT:
    return McpRole.SERVER
  if role == McpRole.SERVER:
    return McpRole.CLIENT
  raise ValueError(f"{role!r} is not a valid MCP wire role (expected 'client' or 'server')")
