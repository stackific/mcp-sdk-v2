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

from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import AfterValidator, Field, StrictBool

from mcp._model import McpModel, validates
from mcp.jsonrpc.framing import is_request_id
from mcp.protocol.capability_negotiation import NOTIFICATION_REQUIRED_CAPABILITY, server_declares
from mcp.protocol.logging import LOGGING_MESSAGE_METHOD
from mcp.protocol.progress import CANCELLED_NOTIFICATION_METHOD, PROGRESS_NOTIFICATION_METHOD

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
#: Reuses the canonical method-name constants from S22 (progress) and S23 (logging).
REQUEST_SCOPED_NOTIFICATION_METHODS = (PROGRESS_NOTIFICATION_METHOD, LOGGING_MESSAGE_METHOD)

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
  """Return ``params._meta[subscriptionId]`` as a string, or ``None`` when absent. (§10.4)

  The lookup is case-sensitive and verbatim — a differently-cased key is not recognized.
  (R-10.4-a, R-10.4-f)
  """
  if not isinstance(params, dict):
    return None
  meta = params.get("_meta")
  if not isinstance(meta, dict):
    return None
  value = meta.get(SUBSCRIPTION_ID_META_KEY)
  return value if isinstance(value, str) else None


# ─── SubscriptionFilter validation & predicates ───────────────────────────────

def is_valid_subscription_filter(value: object) -> bool:
  """Return ``True`` for a well-formed ``SubscriptionFilter``. (§10.2)

  ALL fields are OPTIONAL: ``toolsListChanged`` / ``promptsListChanged`` /
  ``resourcesListChanged`` (booleans), ``resourceSubscriptions`` (array of absolute URI
  strings, R-10.2-i), and ``taskIds`` (array of strings, §25.10). Extra members are
  tolerated (the model uses ``extra="allow"``). (R-10.2-e/-f/-g/-h/-i)
  """
  return validates(SubscriptionFilter, value)


def is_empty_subscription_filter(filter: dict) -> bool:
  """Return ``True`` when the filter requests no kinds at all — every boolean is
  absent/``False`` and ``resourceSubscriptions`` is absent/empty. Such a filter yields an
  acknowledgement-only stream (a client SHOULD set at least one field). (§10.2, R-10.2-k)
  """
  subs = filter.get("resourceSubscriptions")
  return (
    filter.get("toolsListChanged") is not True
    and filter.get("promptsListChanged") is not True
    and filter.get("resourcesListChanged") is not True
    and (subs is None or len(subs) == 0)
  )


# ─── subscriptions/listen request validation (§10.2) ──────────────────────────

def is_valid_subscriptions_listen_request_params(value: object) -> bool:
  """Return ``True`` for valid ``subscriptions/listen`` request ``params``. (§10.2)

  ``notifications`` is REQUIRED — the requested kinds are taken SOLELY from this filter;
  there are no implicit/default subscriptions (R-10.2-b, R-10.1-c). ``_meta`` is REQUIRED
  per-request metadata and MUST be an object (S04 / R-3.7-a; R-10.2-d).
  """
  return validates(SubscriptionsListenRequestParams, value)


def is_valid_subscriptions_listen_request(value: object) -> bool:
  """Return ``True`` for a well-formed ``subscriptions/listen`` request envelope. (§10.2)

  A JSON-RPC request: ``jsonrpc`` is ``"2.0"``, ``id`` is a valid ``RequestId`` (doubling
  as the subscription identifier), ``method`` is ``subscriptions/listen``, and ``params``
  is REQUIRED. A notification shape (no ``id``) is rejected. (R-10.1-a, R-10.1-b, R-10.2-a)
  """
  if not isinstance(value, dict):
    return False
  if value.get("jsonrpc") != "2.0":
    return False
  if not is_request_id(value.get("id")):
    return False
  if value.get("method") != SUBSCRIPTIONS_LISTEN_METHOD:
    return False
  return is_valid_subscriptions_listen_request_params(value.get("params"))


# ─── Subscription correlation `_meta` validation (§10.4) ──────────────────────

def is_valid_subscription_meta(value: object) -> bool:
  """Return ``True`` when ``value`` carries the reserved subscription-id key as a string.
  (§10.4, R-10.4-a, R-10.4-b)

  The fragment present on every subscription notification: it MUST contain
  ``io.modelcontextprotocol/subscriptionId`` with a string value (the request ``id``
  serialized as a JSON string). Other ``_meta`` members are tolerated.
  """
  return validates(SubscriptionMeta, value)


# ─── Acknowledgement notification validation (§10.3) ──────────────────────────

def is_valid_subscriptions_acknowledged_notification_params(value: object) -> bool:
  """Return ``True`` for valid ``notifications/subscriptions/acknowledged`` params. (§10.3)

  ``notifications`` is REQUIRED and reflects the honored subset of the requested filter
  (R-10.3-c, R-10.3-d). ``_meta`` is REQUIRED and MUST carry the subscription id under
  ``io.modelcontextprotocol/subscriptionId`` (R-10.3-e, R-10.4-a).
  """
  return validates(SubscriptionsAcknowledgedNotificationParams, value)


def is_valid_subscriptions_acknowledged_notification(value: object) -> bool:
  """Return ``True`` for the full ``notifications/subscriptions/acknowledged`` envelope —
  the mandatory first message on the stream. (§10.3, R-10.1-e, R-10.3-a, R-10.3-b)
  """
  if not isinstance(value, dict):
    return False
  if value.get("jsonrpc") != "2.0":
    return False
  if value.get("method") != SUBSCRIPTIONS_ACKNOWLEDGED_METHOD:
    return False
  return is_valid_subscriptions_acknowledged_notification_params(value.get("params"))


# ─── resources/updated change-notification validation (§10.5) ─────────────────

def is_valid_resource_updated_notification_params(value: object) -> bool:
  """Return ``True`` for valid ``notifications/resources/updated`` params. (§10.5)

  ``uri`` is REQUIRED and MUST be an absolute URI string [RFC3986] (it MAY be a
  sub-resource of a subscribed container URI, R-10.5-i, R-10.5-j); ``_meta`` carries the
  subscription id for correlation (R-10.5-k, R-10.4-a). S27-owned members are tolerated.
  """
  return validates(ResourceUpdatedNotificationParams, value)


def is_absolute_uri(value: object) -> bool:
  """Return ``True`` for an absolute URI string [RFC3986] — a scheme followed by ``:``
  and at least one further character. A relative reference (no scheme) is rejected.
  (§10.2, R-10.2-i)

  ``scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`` and the part after ``:`` MUST
  be non-empty so values like ``mailto:`` with an empty path are handled consistently
  with the RFC3986 ``scheme ":" hier-part`` requirement.
  """
  if not isinstance(value, str) or not value:
    return False
  scheme, sep, rest = value.partition(":")
  if not sep or not rest or not scheme:
    return False
  return scheme[:1].isalpha() and all(c.isalnum() or c in "+-." for c in scheme)


#: Backward-compatible private alias of :func:`is_absolute_uri`.
_is_absolute_uri = is_absolute_uri


def _require_absolute_uri(value: str) -> str:
  """Field validator: reject a ``resourceSubscriptions`` entry that is not an absolute URI."""
  if not is_absolute_uri(value):
    raise ValueError("resourceSubscriptions entries MUST be absolute URI strings [RFC3986] (R-10.2-i)")
  return value


#: An absolute-URI string element of ``resourceSubscriptions`` — the analogue of the TS
#: ``AbsoluteUriSchema`` (``z.string().refine(isAbsoluteUri)``). (R-10.2-i)
AbsoluteUri = Annotated[str, AfterValidator(_require_absolute_uri)]


class SubscriptionFilter(McpModel):
  """The explicit opt-in describing which change notifications a client wants (§10.2 /
  §6.3) — the Python analogue of the TS ``SubscriptionFilterSchema``.

  ALL fields are OPTIONAL; an omitted field (or ``false`` boolean, or absent/empty array)
  means "not subscribing" to that kind. Unknown members pass through (forward-compatible).
  Booleans are strict (``1``/``"true"`` rejected, like Zod ``z.boolean()``).
  """

  #: ``true`` ⇒ request ``notifications/tools/list_changed``. (R-10.2-e)
  tools_list_changed: StrictBool | None = None
  #: ``true`` ⇒ request ``notifications/prompts/list_changed``. (R-10.2-f)
  prompts_list_changed: StrictBool | None = None
  #: ``true`` ⇒ request ``notifications/resources/list_changed``. (R-10.2-g)
  resources_list_changed: StrictBool | None = None
  #: Absolute URIs for which per-resource ``notifications/resources/updated`` are wanted. (R-10.2-h, R-10.2-i)
  resource_subscriptions: list[AbsoluteUri] | None = None
  #: Task ids to receive ``notifications/tasks`` for (Tasks extension, §25.10).
  task_ids: list[str] | None = None


class SubscriptionMeta(McpModel):
  """The ``_meta`` fragment present on every subscription notification — the Python analogue
  of the TS ``SubscriptionMetaSchema``. It MUST contain the reserved
  ``io.modelcontextprotocol/subscriptionId`` key with a string value (the request ``id``
  serialized as a JSON string); other ``_meta`` members pass through. (§10.4, R-10.4-a, R-10.4-b)
  """

  subscription_id: str = Field(alias=SUBSCRIPTION_ID_META_KEY)


class SubscriptionsListenRequestParams(McpModel):
  """The ``params`` of a ``subscriptions/listen`` request — the analogue of TS
  ``SubscriptionsListenRequestParamsSchema`` (``RequestParamsSchema.extend``).

  ``notifications`` is REQUIRED — the requested kinds come SOLELY from this filter, there
  are no implicit/default subscriptions (R-10.2-b, R-10.1-c). ``_meta`` is REQUIRED
  per-request metadata and MUST be an object (S04 / R-3.7-a; R-10.2-d).
  """

  notifications: SubscriptionFilter
  meta: dict[str, Any] = Field(alias="_meta")


class SubscriptionsAcknowledgedNotificationParams(McpModel):
  """The ``params`` of the mandatory first stream message,
  ``notifications/subscriptions/acknowledged`` — the analogue of TS
  ``SubscriptionsAcknowledgedNotificationParamsSchema``.

  ``notifications`` is REQUIRED and reflects the honored subset of the requested filter
  (R-10.3-c, R-10.3-d); ``_meta`` is REQUIRED and MUST carry the subscription id (R-10.3-e,
  R-10.4-a).
  """

  notifications: SubscriptionFilter
  meta: SubscriptionMeta = Field(alias="_meta")


class ResourceUpdatedNotificationParams(McpModel):
  """The S16-owned constraints on ``notifications/resources/updated`` params — the analogue
  of TS ``ResourceUpdatedNotificationParamsSchema``.

  ``uri`` is REQUIRED and MUST be an absolute URI string [RFC3986] (MAY be a sub-resource
  of a subscribed container URI, R-10.5-i, R-10.5-j); ``_meta`` carries the subscription id
  for correlation (R-10.5-k, R-10.4-a). S27-owned members pass through.
  """

  uri: AbsoluteUri
  meta: SubscriptionMeta = Field(alias="_meta")


def uri_covered_by_subscription(updated_uri: str, subscribed_uri: str) -> bool:
  """Return ``True`` when ``updated_uri`` equals or is a sub-resource of ``subscribed_uri``.

  Container matching is path-prefix based at a path boundary: ``file:///dir`` covers
  ``file:///dir/a.txt`` but not ``file:///directory``; a different scheme/host never
  matches. (§10.5, R-10.5-j)
  """
  if updated_uri == subscribed_uri:
    return True
  if not (is_absolute_uri(updated_uri) and is_absolute_uri(subscribed_uri)):
    return False
  base = subscribed_uri if subscribed_uri.endswith("/") else subscribed_uri + "/"
  return updated_uri.startswith(base)


#: Backward-compatible private alias of :func:`uri_covered_by_subscription`.
_uri_covered_by_subscription = uri_covered_by_subscription


def may_deliver_resource_update(updated_uri: str, subscribed_uris: list[str]) -> bool:
  """Return ``True`` when a ``resources/updated`` for ``updated_uri`` is permitted on a
  subscription whose acknowledged ``resourceSubscriptions`` are ``subscribed_uris`` — i.e.
  the URI (or a parent) was listed. A server MUST NOT send an update for an unlisted
  resource. (§10.2, R-10.2-l, R-10.2-m; §10.5, R-10.5-h)
  """
  return any(uri_covered_by_subscription(updated_uri, sub) for sub in subscribed_uris)


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
    return may_deliver_resource_update(subject_key, uris)
  if method == TASKS_NOTIFICATION_METHOD:
    ids = acknowledged.get("taskIds") or []
    return subject_key is not None and subject_key in ids
  return False


# ─── Declined-kind reporting (§10.3, R-10.3-f) ────────────────────────────────

@dataclass(frozen=True)
class DeclinedFilterKinds:
  """The kinds the client requested but the server did NOT honor. (§10.3, R-10.3-f)

  ``fields`` are the dropped boolean filter fields; ``uris`` are the requested-but-not-
  acknowledged ``resourceSubscriptions`` URIs. Lets a client handle declined kinds
  gracefully and not block waiting on one.
  """

  fields: list[str]
  uris: list[str]


def declined_filter_kinds(requested: dict, acknowledged: dict) -> DeclinedFilterKinds:
  """Return the kinds requested but not honored (declined). (§10.3, R-10.3-f)"""
  fields = [
    f
    for f in ("toolsListChanged", "promptsListChanged", "resourcesListChanged")
    if requested.get(f) is True and acknowledged.get(f) is not True
  ]
  ack_uris = set(acknowledged.get("resourceSubscriptions") or [])
  uris = [u for u in (requested.get("resourceSubscriptions") or []) if u not in ack_uris]
  return DeclinedFilterKinds(fields=fields, uris=uris)


# ─── Stream-boundary classification (§10.6) ───────────────────────────────────

def classify_notification_stream(method: str) -> str:
  """Classify a notification ``method`` against the §10.6 boundary.

  * one of the four change kinds → ``"subscription"`` (R-10.6-c).
  * ``notifications/progress`` / ``notifications/message`` → ``"request-scoped"`` (R-10.6-a).
  * anything else → ``"neither"``.
  """
  if is_change_notification_method(method):
    return "subscription"
  if is_request_scoped_notification_method(method):
    return "request-scoped"
  return "neither"


def is_violation_on_subscription_stream(method: str) -> bool:
  """Return ``True`` when receiving ``method`` on a subscription stream is a protocol
  violation — i.e. it is a request-scoped (progress/logging) kind, which MUST NOT appear
  there. (§10.6, R-10.6-b, R-10.6-e, R-10.6-g)
  """
  return is_request_scoped_notification_method(method)


def is_violation_on_request_stream(method: str) -> bool:
  """Return ``True`` when receiving ``method`` on an unrelated request's response stream is
  a protocol violation — i.e. it is one of the four change kinds, which MUST NOT appear on
  a non-``subscriptions/listen`` response stream. (§10.6, R-10.6-d, R-10.6-f, R-10.6-g)
  """
  return is_change_notification_method(method)


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

  def meta_fragment(self) -> dict:
    """Return the ``params._meta`` fragment to attach to a change notification on this
    stream — carrying the subscription id. (R-10.4-a, R-10.5-a)
    """
    return {SUBSCRIPTION_ID_META_KEY: self.subscription_id}

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

  def teardown_notification(self, reason: str = "subscription torn down by server") -> dict:
    """Build the server-teardown signal: a ``notifications/cancelled`` referencing the
    ``subscriptions/listen`` request ``id``. (§10.7, R-10.7-b, TV-16.14)

    A server tearing down a subscription (e.g. during shutdown) MUST signal it to the
    client — on **stdio** by sending this notification, on **Streamable HTTP** by closing
    the ``text/event-stream`` response. This object is transport-agnostic: the stdio
    transport sends the value returned here after ``close("server-teardown")``; the HTTP
    transport simply ends the SSE response. ``params.requestId`` always equals this
    subscription's listen ``id`` so the client can correlate the teardown.
    """
    return {
      "jsonrpc": "2.0",
      "method": CANCELLED_NOTIFICATION_METHOD,
      "params": {"requestId": self.request_id, "reason": reason},
    }


class SubscriptionRegistry:
  """Routes incoming subscription notifications to the correct active :class:`Subscription`
  by ``io.modelcontextprotocol/subscriptionId`` — essential on stdio where all
  subscriptions share one channel, and supported on HTTP where the key is still present.
  Holds NO state across connections; closing a subscription removes it. A client MAY hold
  multiple independent subscriptions concurrently, each keyed by its own request ``id``.
  (§10.4, R-10.4-c, R-10.4-d, R-10.7-d, R-10.1-i)
  """

  def __init__(self) -> None:
    self._by_id: dict[str, Subscription] = {}

  def add(self, subscription: Subscription) -> None:
    """Register ``subscription``, keyed by its subscription id.

    :raises ValueError: when a subscription with the same id is already active (ids are
      request ids and MUST be unique while in-flight). (R-10.1-i)
    """
    if subscription.subscription_id in self._by_id:
      raise ValueError(
        f"Subscription id {subscription.subscription_id!r} is already active; each "
        "subscription is identified by its own request id (R-10.1-i)"
      )
    self._by_id[subscription.subscription_id] = subscription

  def get(self, subscription_id: str) -> Subscription | None:
    """Return the active subscription with ``subscription_id``, or ``None``."""
    return self._by_id.get(subscription_id)

  def route(self, params: object) -> Subscription | None:
    """Route a notification's ``params`` to its owning subscription using the
    ``io.modelcontextprotocol/subscriptionId`` key. Returns ``None`` when the key is absent
    or no matching subscription is active. (R-10.4-c)
    """
    sub_id = read_subscription_id(params)
    return None if sub_id is None else self._by_id.get(sub_id)

  def remove(self, subscription_id: str, reason: str) -> bool:
    """Close and remove the subscription with ``subscription_id`` (no retained state).
    Returns ``True`` when one was removed. (R-10.7-d)
    """
    sub = self._by_id.get(subscription_id)
    if sub is None:
      return False
    sub.close(reason)
    del self._by_id[subscription_id]
    return True

  @property
  def size(self) -> int:
    """Number of currently active subscriptions."""
    return len(self._by_id)

  @property
  def active_ids(self) -> list[str]:
    """Snapshot of all active subscription ids."""
    return list(self._by_id.keys())
