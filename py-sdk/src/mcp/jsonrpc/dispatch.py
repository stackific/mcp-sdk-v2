"""Method dispatch for JSON-RPC request handling (§3.3, R-3.3-i/-j/-k).

Given a classified request and a registry of known methods, produce the correct error
response when the method is unrecognised or the params are invalid.

The standard JSON-RPC codes ``-32601`` (method not found) and ``-32602`` (invalid
params) are defined as module-local constants here — exactly as the TypeScript SDK does
— so this low-level layer takes no upward dependency on :mod:`mcp.protocol.errors` (the
full registry). They are, of course, the same numeric values.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from mcp.jsonrpc.framing import RequestId

# Standard JSON-RPC 2.0 error codes referenced by R-3.3-j and R-3.3-k.
_METHOD_NOT_FOUND = -32601
_INVALID_PARAMS = -32602

#: A params validator returns a (possibly empty) list of issue messages; an empty list
#: means the params are valid. Mirrors the shape of a schema library's issue list.
ParamsValidator = Callable[[object], list[str]]


@dataclass(frozen=True)
class MethodDescriptor:
  """Describes a method a receiver recognises.

  ``requires_params``: when ``True``, ``params`` MUST be present on every request to
  this method (e.g. because its per-request ``_meta`` is REQUIRED and rides in
  ``params``). Requests omitting ``params`` are rejected with invalid-params. (R-3.3-i)

  ``params_validator``: optional callable validating the ``params`` object; when it
  returns a non-empty issue list, dispatch returns invalid-params. (R-3.3-k)
  """

  requires_params: bool = False
  params_validator: ParamsValidator | None = None


#: Maps method name → descriptor for every method the receiver handles.
MethodRegistry = Mapping[str, MethodDescriptor]


@dataclass(frozen=True)
class DispatchOutcome:
  """The result of attempting to dispatch a request.

  ``ok=True`` when the method is registered and params are valid; otherwise
  ``response`` carries the JSON-RPC error response to send back.
  """

  ok: bool
  response: dict | None = None


def _error_response(id_: RequestId, code: int, message: str) -> dict:
  """Build a JSON-RPC error response echoing ``id`` without type coercion."""
  return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


def dispatch_request(request: dict, registry: MethodRegistry) -> DispatchOutcome:
  """Validate a classified request against a method registry and return the outcome.

  Returns ``ok=True`` when the method is registered and params are valid. Returns an
  error response (whose ``id`` echoes the request id with the same JSON type and value,
  R-3.2-e/-f/-g) when:

  * the method name is not in ``registry`` → **method-not-found** (R-3.3-j);
  * ``requires_params`` is set and ``params`` is absent → **invalid-params** (R-3.3-i);
  * the ``params_validator`` reports issues → **invalid-params** (R-3.3-k).
  """
  descriptor = registry.get(request["method"])

  if descriptor is None:
    return DispatchOutcome(
      False, _error_response(request["id"], _METHOD_NOT_FOUND, "Method not found")
    )

  params = request.get("params")

  if descriptor.requires_params and params is None:
    return DispatchOutcome(
      False,
      _error_response(
        request["id"],
        _INVALID_PARAMS,
        "params must be present for this method (required to carry per-request _meta)",
      ),
    )

  if descriptor.params_validator is not None and params is not None:
    issues = descriptor.params_validator(params)
    if issues:
      return DispatchOutcome(
        False,
        _error_response(request["id"], _INVALID_PARAMS, f"Invalid params: {'; '.join(issues)}"),
      )

  return DispatchOutcome(True)
