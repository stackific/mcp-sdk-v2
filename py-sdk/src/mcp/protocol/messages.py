"""Abstract message-kind predicates for MCP (§1.2, §2.2, §3).

Three kinds are used over JSON-RPC 2.0:

* Request — carries ``id`` and ``method``; expects exactly one matching response.
* Notification — carries ``method`` only; the receiver MUST NOT reply.
* Response — correlates to a request by ``id``; is a result XOR an error.

The concrete JSON-RPC 2.0 envelope (the ``jsonrpc`` field, full ``id`` rules, complete
error shape) lives in :mod:`mcp.jsonrpc.framing`. These predicates fix the structural
invariants stated in §2.2 and underpin that concrete layer. The abstract base permits
a ``null`` id (R-2.2-d); MCP's stricter "id MUST NOT be null" rule (R-3.2-b) is enforced
on the concrete wire request, not here.
"""

from __future__ import annotations


def _is_object(value: object) -> bool:
  return isinstance(value, dict)


def is_request(message: dict) -> bool:
  """Return ``True`` when ``message`` has an ``id`` field — a request, not a
  notification. (AC-01.6)
  """
  return "id" in message


def is_notification(message: dict) -> bool:
  """Return ``True`` when ``message`` has a ``method`` and NO ``id`` — a notification.

  Receivers MUST NOT reply to notifications. (R-2.2-e, AC-01.7)
  """
  return "method" in message and "id" not in message


def is_valid_abstract_request(value: object) -> bool:
  """Return ``True`` for a valid abstract request (§2.2, AC-01.6).

  ``id`` (string, number, or — at the abstract level — ``null``) and string ``method``
  are REQUIRED; ``params`` OPTIONAL and, when present, an object.
  """
  if not _is_object(value):
    return False
  if "id" not in value:
    return False
  id_ = value["id"]
  if not (id_ is None or isinstance(id_, str) or (isinstance(id_, (int, float)) and not isinstance(id_, bool))):
    return False
  if not isinstance(value.get("method"), str):
    return False
  return "params" not in value or _is_object(value["params"])


def is_valid_abstract_notification(value: object) -> bool:
  """Return ``True`` for a valid abstract notification (§2.2, AC-01.7).

  String ``method`` REQUIRED; NO ``id``; ``params`` OPTIONAL object.
  """
  if not _is_object(value):
    return False
  if "id" in value:
    return False
  if not isinstance(value.get("method"), str):
    return False
  return "params" not in value or _is_object(value["params"])


def is_valid_error_payload(value: object) -> bool:
  """Return ``True`` for a valid abstract error payload (§2.2).

  Integer ``code`` and string ``message`` REQUIRED; ``data`` OPTIONAL.
  """
  if not _is_object(value):
    return False
  code = value.get("code")
  return isinstance(code, int) and not isinstance(code, bool) and isinstance(value.get("message"), str)
