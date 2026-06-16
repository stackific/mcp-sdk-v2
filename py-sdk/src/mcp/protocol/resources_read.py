"""Resources II — reading, not-found, notifications & URI schemes (§17.5–§17.9).

The read side of the Resources feature: the ``resources/read`` request + result (a
``CacheableResult`` carrying a non-empty ``contents`` array), the resource-not-found
(-32602, with legacy -32002 acceptance) and internal-error boundary, the change/update
notification payloads, and the common-URI-scheme catalog + direct-fetch guidance.

The §10-filter *delivery* gating for ``notifications/resources/updated``
(:func:`may_notify_resource_updated`) is surfaced here too (mirroring the TS module),
reusing :func:`mcp.protocol.streaming.may_deliver_resource_update`, which owns the
subscription-filter machinery.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import Field, StrictInt

from mcp._model import McpModel, validates
from mcp.jsonrpc.payload import RESULT_TYPE_COMPLETE, RESULT_TYPE_INPUT_REQUIRED
from mcp.protocol.caching import CacheScope
from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.resources import (
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
  ResourceUri,
  is_resource_uri,
  may_accept_resource_request,
)
from mcp.protocol.streaming import may_deliver_resource_update
from mcp.types.resource_contents import ResourceContents

RESOURCES_READ_METHOD = "resources/read"

# ─── Error codes (§17.6) ──────────────────────────────────────────────────────

#: A non-existent resource URI → -32602 (Invalid params). (§17.6, R-17.6-a)
RESOURCE_NOT_FOUND_CODE = INVALID_PARAMS_CODE
#: The legacy not-found code; a client SHOULD accept it too. (§17.6, R-17.6-c)
LEGACY_RESOURCE_NOT_FOUND_CODE = -32002
#: A failure unrelated to the URI's validity → -32603 (Internal error). (§17.6, R-17.6-d)
RESOURCE_READ_INTERNAL_ERROR_CODE = -32603


def is_resource_not_found_code(code: object) -> bool:
  """Return ``True`` when ``code`` denotes resource-not-found (modern -32602 or legacy
  -32002). (§17.6, R-17.6-a/-c)
  """
  return code in (RESOURCE_NOT_FOUND_CODE, LEGACY_RESOURCE_NOT_FOUND_CODE)


def build_resource_not_found_error(uri: str, message: str = "Resource not found") -> dict:
  """Build the -32602 not-found error with ``data.uri``. A server MUST use this — not an
  empty ``contents`` result — to signal non-existence. (§17.5/§17.6, R-17.6-a/-b)
  """
  return {"code": RESOURCE_NOT_FOUND_CODE, "message": message, "data": {"uri": uri}}


def build_resource_read_internal_error(message: str = "Internal error reading resource") -> dict:
  """Build the -32603 error for a failure unrelated to the URI's validity. (§17.6, R-17.6-d)"""
  return {"code": RESOURCE_READ_INTERNAL_ERROR_CODE, "message": message}


# ─── resources/read request (§17.5) ───────────────────────────────────────────

def may_read_resource(server_caps: dict) -> bool:
  """Return ``True`` when ``resources/read`` is permitted (the ``resources`` capability is
  declared). (§17.1 via §17.5)
  """
  return may_accept_resource_request(RESOURCES_READ_METHOD, server_caps)


class ReadResourceRequestParams(McpModel):
  """The ``params`` of a ``resources/read`` request (§17.5) — the Python analogue of the TS
  ``ReadResourceRequestParamsSchema``.

  A REQUIRED RFC3986 ``uri`` plus the OPTIONAL multi-round-trip retry fields
  (``inputResponses`` / ``requestState``) and ``_meta``. (R-17.5-a/-b/-d/-f)
  """

  uri: ResourceUri
  input_responses: dict[str, Any] | None = None
  request_state: str | None = None
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_read_resource_request_params(value: object) -> bool:
  """Return ``True`` for a well-formed ``resources/read`` ``params``: a REQUIRED RFC3986
  ``uri`` plus the OPTIONAL retry fields and ``_meta``. (§17.5, R-17.5-a/-b/-d/-f)
  """
  return validates(ReadResourceRequestParams, value)


def is_valid_read_resource_request(value: object) -> bool:
  """Return ``True`` for a well-formed ``resources/read`` request envelope: the literal
  ``method`` plus REQUIRED ``params``. (§17.5) Mirrors ``ReadResourceRequestSchema``.
  """
  if not isinstance(value, dict) or value.get("method") != RESOURCES_READ_METHOD:
    return False
  return is_valid_read_resource_request_params(value.get("params"))


def build_read_resource_request_params(
  uri: str,
  *,
  input_responses: dict | None = None,
  request_state: str | None = None,
  meta: dict | None = None,
) -> dict:
  """Build ``resources/read`` params; retry fields only when supplied. (§17.5)

  :raises TypeError: when ``uri`` is not a valid RFC3986 resource URI. (R-17.5-b)
  """
  if not is_resource_uri(uri):
    raise TypeError(f"resources/read uri MUST be a URI string [RFC3986] with a scheme (R-17.5-b): {uri}")
  params: dict = {"uri": uri}
  if input_responses is not None:
    params["inputResponses"] = input_responses
  if request_state is not None:
    params["requestState"] = request_state
  if meta is not None:
    params["_meta"] = meta
  return params


def build_read_resource_retry_params(uri: str, input_requests: dict, input_responses: dict, request_state: str | None = None) -> dict:
  """Build retry params for a ``resources/read`` answered with ``input_required``. Every
  ``inputRequests`` key MUST be answered; ``request_state`` is echoed verbatim. (§17.5)

  :raises ValueError: when ``input_responses`` does not answer every ``input_requests`` key.
  """
  missing = [k for k in input_requests if k not in input_responses]
  if missing:
    raise ValueError(f"resources/read retry inputResponses MUST answer every inputRequests key (R-17.5-e); missing: {', '.join(missing)}")
  return build_read_resource_request_params(uri, input_responses=input_responses, request_state=request_state)


# ─── ReadResourceResult (§17.5) ───────────────────────────────────────────────

@dataclass(frozen=True)
class ReadCacheHints:
  """The REQUIRED caching hints a read result carries together. (§13, R-17.5-r)"""

  ttl_ms: int
  cache_scope: str


class ReadResourceResult(McpModel):
  """A completed ``resources/read`` result (§17.5) — the Python analogue of the TS
  ``ReadResourceResultSchema``: a cacheable result whose non-empty ``contents`` array holds
  text/blob ``ResourceContents`` entries. ``resultType`` is fixed to ``"complete"``.
  """

  result_type: Literal["complete"]
  contents: list[ResourceContents] = Field(min_length=1)
  ttl_ms: Annotated[StrictInt, Field(ge=0)]
  cache_scope: CacheScope
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def is_valid_read_resource_result(value: object) -> bool:
  """Return ``True`` for a well-formed (completed) ``ReadResourceResult`` (§17.5): a
  cacheable result with a non-empty ``contents`` array of text/blob entries.
  """
  return validates(ReadResourceResult, value)


def build_read_resource_result(contents: list, hints: ReadCacheHints, *, meta: dict | None = None) -> dict:
  """Build a ``ReadResourceResult`` (``resultType: "complete"`` + caching hints). The
  ``contents`` array MUST NOT be empty — signal non-existence with the -32602 error.
  (§17.5, R-17.5-q/-r/-z)

  :raises ValueError: when ``hints.ttl_ms`` is negative, or ``contents`` is empty.
  """
  if hints.ttl_ms < 0:
    raise ValueError("ReadResourceResult.ttlMs MUST be >= 0 (R-17.5-r)")
  if not contents:
    raise ValueError("ReadResourceResult.contents MUST NOT be empty; use the -32602 error for non-existence (R-17.5-z)")
  result: dict = {"resultType": RESULT_TYPE_COMPLETE, "contents": list(contents), "ttlMs": hints.ttl_ms, "cacheScope": hints.cache_scope}
  if meta is not None:
    result["_meta"] = meta
  return result


def is_input_required_read_result(result: object) -> bool:
  """Return ``True`` when a ``resources/read`` reply is the ``input_required`` variant
  rather than a completed result. (§17.5, R-17.5-w)
  """
  return isinstance(result, dict) and result.get("resultType") == RESULT_TYPE_INPUT_REQUIRED


# ─── Change & update notifications (§17.7) ────────────────────────────────────

def is_resource_list_changed_notification(value: object) -> bool:
  """Return ``True`` for a well-formed ``notifications/resources/list_changed`` (no required
  payload). (§17.7)
  """
  if not isinstance(value, dict) or value.get("method") != RESOURCES_LIST_CHANGED_METHOD:
    return False
  return "params" not in value or isinstance(value["params"], dict)


def is_resource_updated_notification(value: object) -> bool:
  """Return ``True`` for a well-formed ``notifications/resources/updated`` (REQUIRED params
  with a string ``uri``). The full param schema is owned by the streaming module. (§17.7)
  """
  if not isinstance(value, dict) or value.get("method") != RESOURCES_UPDATED_METHOD:
    return False
  params = value.get("params")
  return isinstance(params, dict) and isinstance(params.get("uri"), str)


def build_resource_list_changed_notification(*, meta: dict | None = None) -> dict:
  """Build a ``notifications/resources/list_changed``; ``params`` only when ``_meta`` is
  supplied. (§17.7, R-17.7-b)
  """
  if meta is None:
    return {"method": RESOURCES_LIST_CHANGED_METHOD}
  return {"method": RESOURCES_LIST_CHANGED_METHOD, "params": {"_meta": meta}}


def build_resource_updated_notification(uri: str, subscription_id: str, extra_meta: dict | None = None) -> dict:
  """Build a ``notifications/resources/updated`` carrying the changed ``uri`` and the
  subscription id under ``io.modelcontextprotocol/subscriptionId`` in ``_meta``. (§17.7)
  """
  extra_meta = extra_meta or {}
  inner_meta = extra_meta.get("_meta") if isinstance(extra_meta.get("_meta"), dict) else {}
  params = {k: v for k, v in extra_meta.items() if k != "_meta"}
  params["uri"] = uri
  params["_meta"] = {**inner_meta, "io.modelcontextprotocol/subscriptionId": subscription_id}
  return {"method": RESOURCES_UPDATED_METHOD, "params": params}


def may_notify_resource_updated(updated_uri: str, filter_: dict) -> bool:
  """Return ``True`` when a server MAY send ``notifications/resources/updated`` for
  ``updated_uri`` given the client's opted-in ``resourceSubscriptions`` filter — i.e. the
  URI (or a parent container it is a sub-resource of) was listed. A server MUST NOT send an
  update for any resource the client did not opt into; an empty (or absent) subscription
  list never matches. Reuses the streaming module's :func:`may_deliver_resource_update`.
  (§17.7, R-17.7-i/-j)
  """
  subscriptions = filter_.get("resourceSubscriptions") or []
  if not subscriptions:
    return False
  return may_deliver_resource_update(updated_uri, subscriptions)


def may_notify_resources_list_changed(filter_: dict) -> bool:
  """Return ``True`` when a server MAY deliver ``resources/list_changed`` on a stream — only
  when the client opted in via ``resourcesListChanged: true``. (§17.7, R-17.7-d/-e)
  """
  return filter_.get("resourcesListChanged") is True


#: There is NO subscribe/unsubscribe request method for resources — opting in/out is
#: governed entirely by the §10 stream filters. (§17.7, R-17.7-a)
RESOURCE_SUBSCRIBE_REQUEST_METHODS: tuple = ()


def is_resource_subscribe_request_method(_method: str) -> bool:
  """Always ``False`` — no per-resource subscribe/unsubscribe request method exists. (R-17.7-a)"""
  return False


# ─── Common URI schemes (§17.9) ───────────────────────────────────────────────

WELL_KNOWN_URI_SCHEMES = ("https", "file", "git")
INODE_DIRECTORY_MIME_TYPE = "inode/directory"

_SCHEME_CAPTURE_RE = re.compile(r"^([a-zA-Z][a-zA-Z0-9+.\-]*):")


def uri_scheme(value: object) -> str | None:
  """Return the lower-cased RFC3986 scheme of ``value``, or ``None`` when absent. (§17.9)"""
  if not isinstance(value, str):
    return None
  match = _SCHEME_CAPTURE_RE.match(value)
  return match.group(1).lower() if match else None


def is_custom_uri_scheme(value: object) -> bool:
  """Return ``True`` for a valid RFC3986 URI whose scheme is NOT a well-known one. (§17.9)"""
  if not is_resource_uri(value):
    return False
  scheme = uri_scheme(value)
  return scheme is not None and scheme not in WELL_KNOWN_URI_SCHEMES


def is_https_resource_uri(value: object) -> bool:
  """Return ``True`` for an ``https``-scheme resource URI. (§17.5/§17.9, R-17.5-y, R-17.9-b)"""
  return is_resource_uri(value) and uri_scheme(value) == "https"


def may_fetch_directly(uri: str) -> bool:
  """Return ``True`` when a client MAY fetch ``uri`` directly (it is an ``https`` resource
  URI), skipping ``resources/read``. (§17.5, R-17.5-y)
  """
  return is_https_resource_uri(uri)


def recommended_uri_scheme(directly_fetchable: bool) -> dict:
  """Return the SHOULD-recommended scheme posture: ``https`` when directly web-fetchable,
  else a non-``https`` scheme. (§17.9, R-17.9-b/-c)
  """
  if directly_fetchable:
    return {"scheme": "https", "rationale": "The client can fetch the resource directly from the web; use https (R-17.9-b)"}
  return {"scheme": "non-https", "rationale": "Not directly web-fetchable by the client; prefer another/custom scheme (R-17.9-c)"}


def should_use_https_scheme(directly_fetchable: bool) -> bool:
  """Return ``True`` when ``https`` is consistent with §17.9 guidance — only when the client
  can fetch it directly. (R-17.9-b/-c)
  """
  return directly_fetchable
