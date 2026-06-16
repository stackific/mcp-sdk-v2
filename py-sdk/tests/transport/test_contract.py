"""Tests for the transport contract + directionality (§7.1–§7.6)."""

import pytest

from mcp.transport.contract import (
  STATELESS_TRANSPORT_RULES,
  TRANSPORT_GUARANTEES,
  Transport,
  TransportCloseInfo,
  TransportError,
  is_direction_permitted,
)


class TestDirectionality:
  def test_request_client_to_server_only(self):
    assert is_direction_permitted("request", "client-to-server")
    assert not is_direction_permitted("request", "server-to-client")

  def test_response_server_to_client_only(self):
    assert is_direction_permitted("response", "server-to-client")
    assert not is_direction_permitted("response", "client-to-server")

  def test_notification_either_direction(self):
    assert is_direction_permitted("notification", "client-to-server")
    assert is_direction_permitted("notification", "server-to-client")


class TestTransportError:
  def test_code_and_message(self):
    err = TransportError("boom")
    assert err.code == "TRANSPORT_ERROR"
    assert "boom" in str(err)

  def test_cause_chaining(self):
    try:
      try:
        raise ValueError("root")
      except ValueError as cause:
        raise TransportError("wrapped") from cause
    except TransportError as e:
      assert isinstance(e.__cause__, ValueError)


class TestCloseInfo:
  def test_defaults(self):
    info = TransportCloseInfo(clean=True)
    assert info.clean is True and info.reason is None


class TestAbstract:
  def test_transport_cannot_be_instantiated(self):
    with pytest.raises(TypeError):
      Transport()  # type: ignore[abstract]


class TestDocumentationConstants:
  def test_guarantees_present(self):
    assert "FRAMING" in TRANSPORT_GUARANTEES
    assert "R-7.2-t" in TRANSPORT_GUARANTEES["CLEAN_CLOSE"]

  def test_stateless_rules_present(self):
    assert STATELESS_TRANSPORT_RULES["CONTEXT_FROM_META_ONLY"] == "R-7.6-f"
