"""JSON-RPC 2.0 framing (§3.1–§3.5) and payload shapes (§3.6–§3.9).

Re-exports the public surface of :mod:`mcp.jsonrpc.framing` and
:mod:`mcp.jsonrpc.payload`.
"""

from mcp.jsonrpc.dispatch import (
  DispatchOutcome,
  MethodDescriptor,
  MethodRegistry,
  ParamsValidator,
  dispatch_request,
)
from mcp.jsonrpc.framing import (
  ClassifiedMessage,
  InFlightTracker,
  MalformedMessageError,
  MessageKind,
  RequestId,
  classify_message,
  id_echo_matches,
  is_request_id,
)
from mcp.jsonrpc.payload import (
  KNOWN_RESULT_TYPES,
  RESULT_TYPE_COMPLETE,
  RESULT_TYPE_INPUT_REQUIRED,
  McpError,
  ResultTypeInterpretation,
  interpret_result_type,
  is_cursor,
  is_known_result_type,
  is_progress_token,
  is_valid_empty_result,
  is_valid_mcp_error,
  is_valid_notification_params,
  is_valid_request_params,
  is_valid_result,
)

__all__ = [
  "RequestId",
  "MessageKind",
  "ClassifiedMessage",
  "MalformedMessageError",
  "classify_message",
  "is_request_id",
  "id_echo_matches",
  "InFlightTracker",
  "RESULT_TYPE_COMPLETE",
  "RESULT_TYPE_INPUT_REQUIRED",
  "KNOWN_RESULT_TYPES",
  "is_known_result_type",
  "ResultTypeInterpretation",
  "interpret_result_type",
  "is_valid_result",
  "is_valid_empty_result",
  "is_valid_request_params",
  "is_valid_notification_params",
  "is_progress_token",
  "is_cursor",
  "McpError",
  "is_valid_mcp_error",
  "MethodDescriptor",
  "MethodRegistry",
  "ParamsValidator",
  "DispatchOutcome",
  "dispatch_request",
]
