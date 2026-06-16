"""Tests for protocol roles and the Implementation re-export (§1.1, §2.2, §14.3).

Mirrors the TS suites:
  * ts-sdk/src/__tests__/protocol/roles.test.ts          (McpRole — AC-01.1)
  * ts-sdk/src/__tests__/protocol/implementation.test.ts (re-export — AC-01.28..30)
  * ts-sdk/src/__tests__/types/implementation.test.ts    (full shape — AC-20.29..30)

The roles model is enforced primarily at the type level in TS; here we verify the
exported constant *values* a caller depends on (e.g. comparing a received role string),
the closed-set predicate, and the peer relationship — plus the host is NOT a wire role.

The protocol ``implementation`` module is a thin re-export for import-path stability, so
we assert it is identical to the canonical :mod:`mcp.types.implementation` surface and
exercise the full §14.3 shape, required/optional fields, and forward-compatibility
through the re-exported names.
"""

import pytest

from mcp.protocol import implementation as proto_impl
from mcp.protocol.implementation import (
  ICON_THEMES,
  Implementation,
  is_valid_icon,
  is_valid_implementation,
  parse_implementation,
)
from mcp.protocol.roles import MCP_ROLES, McpRole, is_mcp_role, peer_role
from mcp.types.icon import Icon


# ─── McpRole — §1.1, §2.2 (AC-01.1) ───────────────────────────────────────────


class TestMcpRoleValues:
  def test_client_has_wire_value_client(self):
    assert McpRole.CLIENT == "client"

  def test_server_has_wire_value_server(self):
    assert McpRole.SERVER == "server"

  def test_client_and_server_are_distinct(self):
    assert McpRole.CLIENT != McpRole.SERVER

  def test_covers_exactly_the_two_wire_roles(self):
    # The host is NOT a JSON-RPC wire role (§2.2) and must be absent.
    assert MCP_ROLES == frozenset({"client", "server"})
    assert len(MCP_ROLES) == 2

  def test_host_is_not_a_wire_role(self):
    assert "host" not in MCP_ROLES
    assert McpRole.CLIENT != "host"
    assert McpRole.SERVER != "host"


class TestIsMcpRole:
  def test_accepts_both_wire_roles(self):
    assert is_mcp_role("client")
    assert is_mcp_role("server")
    assert is_mcp_role(McpRole.CLIENT)
    assert is_mcp_role(McpRole.SERVER)

  def test_rejects_host(self):
    # Host is a role (§1.1) but not a wire role (§2.2).
    assert not is_mcp_role("host")

  def test_is_case_sensitive(self):
    assert not is_mcp_role("Client")
    assert not is_mcp_role("SERVER")

  def test_rejects_conversation_roles(self):
    # §14.7 conversation roles are an unrelated enumeration; do not conflate.
    assert not is_mcp_role("user")
    assert not is_mcp_role("assistant")

  @pytest.mark.parametrize("value", ["", " client", "client ", "peer", "sender", "receiver"])
  def test_rejects_near_miss_and_other_terms(self, value):
    assert not is_mcp_role(value)

  @pytest.mark.parametrize("value", [None, 0, 1, True, False, [], {}, ["client"], object()])
  def test_rejects_non_string_values(self, value):
    assert not is_mcp_role(value)


class TestPeerRole:
  def test_client_peer_is_server(self):
    assert peer_role(McpRole.CLIENT) == McpRole.SERVER

  def test_server_peer_is_client(self):
    assert peer_role(McpRole.SERVER) == McpRole.CLIENT

  def test_peer_relationship_is_symmetric(self):
    assert peer_role(peer_role(McpRole.CLIENT)) == McpRole.CLIENT
    assert peer_role(peer_role(McpRole.SERVER)) == McpRole.SERVER

  @pytest.mark.parametrize("bad", ["host", "Client", "", "peer", "user"])
  def test_raises_for_non_wire_role(self, bad):
    with pytest.raises(ValueError):
      peer_role(bad)


# ─── Implementation re-export wiring — §14.3 (AC-01.28..30) ────────────────────


class TestReExportIdentity:
  def test_reexports_canonical_symbols(self):
    # Import-path stability: the protocol names ARE the canonical types-layer ones.
    from mcp.types import icon as types_icon
    from mcp.types import implementation as types_impl

    assert Implementation is types_impl.Implementation
    assert parse_implementation is types_impl.parse_implementation
    assert is_valid_implementation is types_impl.is_valid_implementation
    assert is_valid_icon is types_icon.is_valid_icon
    assert ICON_THEMES is types_icon.ICON_THEMES

  def test_public_all_lists_the_reexported_surface(self):
    assert set(proto_impl.__all__) == {
      "Implementation",
      "parse_implementation",
      "is_valid_implementation",
      "is_valid_icon",
      "ICON_THEMES",
    }


# ─── Required fields — AC-01.28 / AC-20.29 (R-14.3-a, R-14.3-d) ────────────────


class TestRequiredFields:
  def test_parses_when_name_and_version_present(self):
    impl = parse_implementation({"name": "example-mcp-server", "version": "1.4.2"})
    assert impl.name == "example-mcp-server"
    assert impl.version == "1.4.2"

  def test_minimal_is_valid(self):
    assert is_valid_implementation({"name": "my-client", "version": "1.0.0"})

  def test_rejects_when_name_absent(self):
    assert not is_valid_implementation({"version": "1.0.0"})
    with pytest.raises(ValueError):
      parse_implementation({"version": "1.0.0"})

  def test_rejects_when_version_absent(self):
    assert not is_valid_implementation({"name": "srv"})
    with pytest.raises(ValueError):
      parse_implementation({"name": "srv"})

  def test_rejects_when_both_required_absent(self):
    assert not is_valid_implementation({})
    with pytest.raises(ValueError):
      parse_implementation({})

  def test_rejects_when_name_not_a_string(self):
    assert not is_valid_implementation({"name": 42, "version": "1.0"})
    with pytest.raises(ValueError):
      parse_implementation({"name": 42, "version": "1.0"})

  def test_rejects_when_version_not_a_string(self):
    assert not is_valid_implementation({"name": "srv", "version": 2})
    with pytest.raises(ValueError):
      parse_implementation({"name": "srv", "version": 2})

  @pytest.mark.parametrize("value", [None, 42, "nope", [], ["name"], ("name", "version")])
  def test_rejects_non_object_values(self, value):
    assert not is_valid_implementation(value)
    with pytest.raises(ValueError):
      parse_implementation(value)


# ─── Optional fields — AC-01.29 / AC-20.29 (R-14.3-b, -c, -e, -f) ──────────────


class TestOptionalFields:
  def test_parses_with_title(self):
    impl = parse_implementation({"name": "srv", "version": "1.0", "title": "My Server"})
    assert impl.title == "My Server"

  def test_parses_with_description(self):
    impl = parse_implementation(
      {"name": "srv", "version": "1.0", "description": "A sample MCP client."}
    )
    assert impl.description == "A sample MCP client."

  def test_parses_with_website_url(self):
    impl = parse_implementation(
      {"name": "srv", "version": "1.0", "websiteUrl": "https://example.com"}
    )
    assert impl.website_url == "https://example.com"

  def test_parses_with_icons_array(self):
    impl = parse_implementation(
      {"name": "srv", "version": "1.0", "icons": [{"src": "https://example.com/icon.png"}]}
    )
    assert impl.icons is not None
    assert len(impl.icons) == 1

  def test_accepts_empty_icons_array(self):
    impl = parse_implementation({"name": "srv", "version": "1.0", "icons": []})
    assert impl.icons == []

  def test_all_optional_fields_absent_by_default(self):
    impl = parse_implementation({"name": "srv", "version": "1.0"})
    assert impl.title is None
    assert impl.description is None
    assert impl.website_url is None
    assert impl.icons is None

  def test_fully_populated_descriptor(self):
    impl = parse_implementation(
      {
        "name": "example-server",
        "title": "Example MCP Server",
        "version": "2.4.1",
        "description": "Provides filesystem and search tools.",
        "websiteUrl": "https://example.com/mcp",
        "icons": [{"src": "https://example.com/icon.png", "mimeType": "image/png"}],
      }
    )
    assert isinstance(impl, Implementation)
    assert impl.name == "example-server"
    assert impl.title == "Example MCP Server"
    assert impl.version == "2.4.1"
    assert impl.description == "Provides filesystem and search tools."
    assert impl.website_url == "https://example.com/mcp"
    assert impl.icons == [Icon(src="https://example.com/icon.png", mime_type="image/png")]
    assert impl.extra == {}


# ─── Forward-compatibility — AC-01.30 / AC-20.30 (§2.3.4, R-14.3-f) ────────────


class TestForwardCompatibility:
  def test_unknown_property_does_not_reject(self):
    assert is_valid_implementation(
      {"name": "example-mcp-server", "version": "1.4.2", "x-vendor-buildId": "2026-06-13-abc"}
    )

  def test_nested_unknown_property_does_not_reject(self):
    assert is_valid_implementation(
      {"name": "srv", "version": "1.0", "unknownProp": {"nested": True}}
    )

  def test_recognised_fields_intact_with_unknowns(self):
    impl = parse_implementation({"name": "my-server", "version": "2.0.0", "x-custom": 99})
    assert impl.name == "my-server"
    assert impl.version == "2.0.0"

  def test_unknown_fields_preserved_in_extra(self):
    impl = parse_implementation(
      {"name": "s", "version": "1.0", "unknownFutureField": "value", "x-extra": 1}
    )
    assert impl.extra == {"unknownFutureField": "value", "x-extra": 1}

  def test_known_keys_never_leak_into_extra(self):
    impl = parse_implementation(
      {
        "name": "s",
        "title": "T",
        "icons": [],
        "version": "1.0",
        "description": "d",
        "websiteUrl": "https://x",
      }
    )
    assert impl.extra == {}


# ─── parse helper round-trip ───────────────────────────────────────────────────


class TestParseHelper:
  def test_returns_parsed_descriptor_for_valid_input(self):
    impl = parse_implementation({"name": "test-client", "version": "0.1.0", "x-extra": 1})
    assert isinstance(impl, Implementation)
    assert impl.name == "test-client"
    assert impl.version == "0.1.0"

  def test_throws_for_missing_required_fields(self):
    with pytest.raises(ValueError):
      parse_implementation({"version": "1.0"})
    with pytest.raises(ValueError):
      parse_implementation({"name": "srv"})


# ─── Re-exported icon helpers — §14.2 ──────────────────────────────────────────


class TestReExportedIconHelpers:
  def test_is_valid_icon_accepts_minimal(self):
    assert is_valid_icon({"src": "https://example.com/icon.png"})

  def test_is_valid_icon_rejects_without_src(self):
    assert not is_valid_icon({"mimeType": "image/png"})

  def test_icon_themes_is_closed_set(self):
    assert ICON_THEMES == frozenset({"light", "dark"})
