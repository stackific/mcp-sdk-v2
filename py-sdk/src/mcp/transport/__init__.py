"""Transport layer (§7): the channel contract, framing, and the in-memory transport.

Re-exports the public surface of :mod:`mcp.transport.contract`,
:mod:`mcp.transport.framing`, and :mod:`mcp.transport.in_memory`.
"""

from mcp.transport.contract import (
  CUSTOM_TRANSPORT_OBLIGATIONS,
  STATELESS_TRANSPORT_RULES,
  STDIO_DISCONNECT_POLICY,
  TRANSPORT_GUARANTEES,
  DirectionalKind,
  MessageDirection,
  RequestContext,
  Transport,
  TransportCloseInfo,
  TransportError,
  Unsubscribe,
  derive_request_context,
  extract_envelope_for_mirroring,
  is_direction_permitted,
  request_carries_meta_envelope,
)
from mcp.transport.framing import (
  NEWLINE_BYTE,
  DecodeResult,
  FrameDecoder,
  MessageFramer,
  NewlineFramer,
  decode_message_unit,
  encode_message_unit,
  try_decode_message_unit,
)
from mcp.transport.in_memory import InMemoryTransport, create_in_memory_transport_pair

__all__ = [
  "Transport",
  "TransportError",
  "TransportCloseInfo",
  "Unsubscribe",
  "MessageDirection",
  "DirectionalKind",
  "is_direction_permitted",
  "RequestContext",
  "request_carries_meta_envelope",
  "derive_request_context",
  "extract_envelope_for_mirroring",
  "TRANSPORT_GUARANTEES",
  "CUSTOM_TRANSPORT_OBLIGATIONS",
  "STDIO_DISCONNECT_POLICY",
  "STATELESS_TRANSPORT_RULES",
  "NEWLINE_BYTE",
  "encode_message_unit",
  "decode_message_unit",
  "try_decode_message_unit",
  "DecodeResult",
  "FrameDecoder",
  "MessageFramer",
  "NewlineFramer",
  "InMemoryTransport",
  "create_in_memory_transport_pair",
]
