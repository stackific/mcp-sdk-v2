"""Server-to-client streaming & subscriptions (§10).

The single, transport-agnostic mechanism by which a client opts in to
server-initiated change notifications: the ``subscriptions/listen`` request, whose
response is ONE long-lived stream carrying only the kinds the client explicitly
requested. The stream's request ``id`` is the subscription identifier, echoed on
every delivered notification (the acknowledgement included) under the reserved
``io.modelcontextprotocol/subscriptionId`` ``_meta`` key (§10.4).

Exactly four change-notification kinds flow on the stream, each gated by its filter
field AND the relevant server capability/sub-flag. Request-scoped notifications
(progress / logging) MUST NOT appear here (§10.6).
"""

from __future__ import annotations

from mcp.protocol.capability_negotiation import NOTIFICATION_REQUIRED_CAPABILITY, server_declares

# ─── Method names ───────────────────────────────────────────────────────────────

SUBSCRIPTIONS_LISTEN_METHOD = "subscriptions/listen"
SUBSCRIPTIONS_ACKNOWLEDGED_METHOD = "notifications/subscriptions/acknowledged"
TOOLS_LIST_CHANGED_METHOD = "notifications/tools/list_changed"
PROMPTS_LIST_CHANGED_METHOD = "notifications/prompts/list_changed"
RESOURCES_LIST_CHANGED_METHOD = "notifications/resources/list_changed"
RESOURCES_UPDATED_METHOD = "notifications/resources/updated"
TASKS_NOTIFICATION_METHOD = "notifications/tasks"

#: The exactly-four change-notification kinds that flow on a subscription stream. (§10.5)
CHANGE_NOTIFICATION_METHODS = (
  TOOLS_LIST_CHANGED_METHOD,
  PROMPTS_LIST_CHANGED_METHOD,
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
)

#: The two request-scoped kinds that MUST NOT appear on a subscription stream. (§10.6)
REQUEST_SCOPED_NOTIFICATION_METHODS = ("notifications/progress", "notifications/message")

#: The reserved ``_meta`` key correlating every subscription notification. (§10.4, R-10.4-a)
SUBSCRIPTION_ID_META_KEY = "io.modelcontextprotocol/subscriptionId"

#: The three boolean filter fields keyed by the change method they gate.
_FILTER_FIELD_BY_METHOD = {
  TOOLS_LIST_CHANGED_METHOD: "toolsListChanged",
  PROMPTS_LIST_CHANGED_METHOD: "promptsListChanged",
  RESOURCES_LIST_CHANGED_METHOD: "resourcesListChanged",
}


def is_change_notification_method(method: str) -> bool:
  """Return ``True`` when ``method`` is one of the four subscription change kinds."""
  return method in CHANGE_NOTIFICATION_METHODS


def is_request_scoped_notification_method(method: str) -> bool:
  """Return ``True`` when ``method`` is a request-scoped (progress/logging) notification."""
  return method in REQUEST_SCOPED_NOTIFICATION_METHODS


def subscription_id_from_request_id(request_id: str | int) -> str:
  """Serialize a listen-request ``id`` into the subscription-id string. (§10.4, R-10.4-b)"""
  return str(request_id)


def read_subscription_id(params: object) -> str | None:
  """Return ``params._meta[subscriptionId]`` as a string, or ``None`` when absent. (§10.4)"""
  if not isinstance(params, dict):
    return None
  meta = params.get("_meta")
  if not isinstance(meta, dict):
    return None
  value = meta.get(SUBSCRIPTION_ID_META_KEY)
  return value if isinstance(value, str) else None


def _is_absolute_uri(value: object) -> bool:
  """Return ``True`` for an absolute URI string (a scheme followed by ``:``). (R-10.2-i)"""
  if not isinstance(value, str) or not value:
    return False
  scheme, sep, _ = value.partition(":")
  return bool(sep) and scheme[:1].isalpha() and all(c.isalnum() or c in "+-." for c in scheme)


def _uri_covered_by_subscription(updated_uri: str, subscribed_uri: str) -> bool:
  """Return ``True`` when ``updated_uri`` equals or is a sub-resource of ``subscribed_uri``.

  Container matching is path-prefix based at a path boundary: ``file:///dir`` covers
  ``file:///dir/a.txt`` but not ``file:///directory``. (§10.5, R-10.5-j)
  """
  if updated_uri == subscribed_uri:
    return True
  if not (_is_absolute_uri(updated_uri) and _is_absolute_uri(subscribed_uri)):
    return False
  base = subscribed_uri if subscribed_uri.endswith("/") else subscribed_uri + "/"
  return updated_uri.startswith(base)


def compute_acknowledged_filter(
  requested: dict,
  server_caps: dict,
  *,
  tasks_active: bool = False,
) -> dict:
  """Compute the honored-subset filter for the acknowledgement. (§10.3, R-10.3-c/d)

  A kind is honored only when the client requested it AND the gating server
  capability/sub-flag is declared. Unsupported kinds are OMITTED entirely.
  ``taskIds`` are honored only when the Tasks extension is active for the request.
  """
  honored: dict = {}
  for method, field in _FILTER_FIELD_BY_METHOD.items():
    if requested.get(field) is not True:
      continue
    required = NOTIFICATION_REQUIRED_CAPABILITY.get(method)
    if required is None or server_declares(server_caps, required):
      honored[field] = True

  uris = requested.get("resourceSubscriptions")
  if isinstance(uris, list) and uris:
    required = NOTIFICATION_REQUIRED_CAPABILITY[RESOURCES_UPDATED_METHOD]
    if server_declares(server_caps, required):
      honored["resourceSubscriptions"] = list(uris)

  task_ids = requested.get("taskIds")
  if isinstance(task_ids, list) and task_ids and tasks_active:
    honored["taskIds"] = list(task_ids)

  return honored


def may_emit_change_notification(method: str, acknowledged: dict, subject_key: str | None = None) -> bool:
  """Return ``True`` when the server MAY emit ``method`` on a stream with ``acknowledged``.

  For ``notifications/resources/updated`` pass the updated URI as ``subject_key``;
  for ``notifications/tasks`` pass the task id. (§10.5, R-10.5-l)
  """
  if method == TOOLS_LIST_CHANGED_METHOD:
    return acknowledged.get("toolsListChanged") is True
  if method == PROMPTS_LIST_CHANGED_METHOD:
    return acknowledged.get("promptsListChanged") is True
  if method == RESOURCES_LIST_CHANGED_METHOD:
    return acknowledged.get("resourcesListChanged") is True
  if method == RESOURCES_UPDATED_METHOD:
    uris = acknowledged.get("resourceSubscriptions") or []
    if not uris or subject_key is None:
      return False
    return any(_uri_covered_by_subscription(subject_key, u) for u in uris)
  if method == TASKS_NOTIFICATION_METHOD:
    ids = acknowledged.get("taskIds") or []
    return subject_key is not None and subject_key in ids
  return False


class Subscription:
  """Tracks the request-scoped lifecycle of a single subscription (§10.7).

  Lifecycle: ``opening`` → (ack sent) → ``active`` → (cancel/teardown/close) →
  ``closed``. There is no resumption; re-establishment is a fresh
  ``subscriptions/listen`` request yielding a new id. (R-10.7-d, R-10.7-f)
  """

  def __init__(
    self,
    request_id: str | int,
    requested: dict,
    server_caps: dict | None = None,
    *,
    tasks_active: bool = False,
  ) -> None:
    self.request_id = request_id
    self.requested = requested
    self.subscription_id = subscription_id_from_request_id(request_id)
    self.acknowledged_filter = compute_acknowledged_filter(
      requested, server_caps or {}, tasks_active=tasks_active
    )
    self._state = "opening"
    self._close_reason: str | None = None

  @property
  def state(self) -> str:
    return self._state

  @property
  def close_reason(self) -> str | None:
    return self._close_reason

  @property
  def is_closed(self) -> bool:
    return self._state == "closed"

  def acknowledge(self) -> dict:
    """Build the mandatory first ``acknowledged`` params; go ``opening`` → ``active``. (R-10.3-a)"""
    if self._state != "opening":
      raise RuntimeError(
        f"Subscription {self.request_id!r} already acknowledged or closed (R-10.3-a)"
      )
    self._state = "active"
    return {
      "notifications": self.acknowledged_filter,
      "_meta": {SUBSCRIPTION_ID_META_KEY: self.subscription_id},
    }

  def may_emit(self, method: str, subject_key: str | None = None) -> bool:
    """Return ``True`` when ``method`` may be emitted on this active stream. (R-10.5-l)"""
    if self._state != "active":
      return False
    return may_emit_change_notification(method, self.acknowledged_filter, subject_key)

  def close(self, reason: str) -> None:
    """Transition to ``closed`` (idempotent; the first reason wins). (R-10.7-a)"""
    if self._state == "closed":
      return
    self._state = "closed"
    self._close_reason = reason
