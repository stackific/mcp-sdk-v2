"""Tests for Roots (Deprecated) (§21.1).

Mirrors the TS suite (``ts-sdk/src/__tests__/protocol/roots.test.ts``), one or more cases
per numbered acceptance criterion (AC-32.1 … AC-32.18), PLUS Python-specific edge cases.
Roots is DEPRECATED; these tests verify the wire contract is still honored fully while the
capability remains published.
"""

from mcp.protocol.capability_negotiation import (
  is_deprecated_client_capability,
  may_invoke_roots_list,
)
from mcp.protocol.multi_round_trip import is_valid_list_roots_result
from mcp.protocol.roots import (
  PROTOCOL_ENFORCES_ROOT_BOUNDARIES,
  ROOTS_CAPABILITY_NAME,
  ROOTS_LIST_CHANGED_NOTIFICATION_METHOD,
  ROOTS_LIST_CHANGED_SUPPORTED,
  ROOTS_LIST_METHOD,
  ROOTS_MIGRATION_TARGETS,
  RootCandidate,
  apply_non_file_disposition,
  assemble_list_roots_result,
  decide_roots_request,
  declares_roots,
  is_conformant_non_file_disposition,
  is_path_traversal_safe,
  is_path_within_reported_roots,
  is_recommended_migration_target,
  is_roots_deprecated,
  is_roots_list_method,
  is_valid_file_uri,
  is_valid_root,
  is_valid_roots_capability_value,
  is_valid_roots_list_input_request,
  is_valid_strict_list_roots_result,
  may_rely_on_roots_list_changed,
  protocol_enforces_root_boundaries,
  should_tolerate_unavailable_root,
)

FILE_URI = "file:///home/user/projects/myproject"


# ─── AC-32.1 — roots NOT adopted for new functionality; migration targets are ─

class TestDeprecation:
  def test_deprecated(self):
    assert is_roots_deprecated()
    assert is_deprecated_client_capability(ROOTS_CAPABILITY_NAME)

  def test_capability_name(self):
    assert ROOTS_CAPABILITY_NAME == "roots"

  def test_migration_targets_exact_order(self):
    assert tuple(ROOTS_MIGRATION_TARGETS) == (
      "tool-input-parameters",
      "resource-uris",
      "server-configuration",
    )

  def test_migration_targets(self):
    assert is_recommended_migration_target("tool-input-parameters")
    assert is_recommended_migration_target("resource-uris")
    assert is_recommended_migration_target("server-configuration")

  def test_roots_is_not_a_migration_target(self):
    assert not is_recommended_migration_target("roots")
    assert not is_recommended_migration_target("anything-else")


# ─── AC-32.2 — a well-formed exchange is honored end-to-end despite Deprecated ─

class TestEndToEnd:
  def test_honors_declaration_request_result(self):
    assert declares_roots({"roots": {}})
    assert is_valid_roots_list_input_request({"method": "roots/list"})
    assert is_valid_strict_list_roots_result(
      {"roots": [{"uri": FILE_URI, "name": "My Project"}]}
    )


# ─── AC-32.3 / AC-32.4 — capability value + declaration ────────────────────────

class TestCapability:
  def test_accepts_empty_object(self):
    assert is_valid_roots_capability_value({})

  def test_rejects_non_object_values(self):
    assert not is_valid_roots_capability_value(True)
    assert not is_valid_roots_capability_value([])
    assert not is_valid_roots_capability_value("x")
    assert not is_valid_roots_capability_value(None)
    assert not is_valid_roots_capability_value(42)

  def test_unrecognized_members_tolerated(self):
    caps = {"roots": {"futureFlag": True, "nested": {"a": 1}}}
    assert declares_roots(caps)
    assert is_valid_roots_capability_value(caps["roots"])

  def test_declares(self):
    assert declares_roots({"roots": {}})
    assert not declares_roots({})


# ─── AC-32.5 — no listChanged mechanism is relied upon for roots ───────────────

class TestNoListChanged:
  def test_supported_flag_is_false(self):
    assert ROOTS_LIST_CHANGED_SUPPORTED is False

  def test_may_rely_returns_false_regardless_of_contents(self):
    assert not may_rely_on_roots_list_changed({})
    assert not may_rely_on_roots_list_changed({"roots": {}})
    assert not may_rely_on_roots_list_changed({"roots": {"listChanged": True}})

  def test_notification_method_name(self):
    assert ROOTS_LIST_CHANGED_NOTIFICATION_METHOD == "notifications/roots/list_changed"


# ─── AC-32.6 — server gating on declaration ────────────────────────────────────

class TestServerGating:
  def test_decides_request_when_declared(self):
    assert decide_roots_request({"roots": {}}).action == "request"
    assert may_invoke_roots_list({"roots": {}})

  def test_proceeds_without_roots_when_not_declared(self):
    assert decide_roots_request({}).action == "proceed-without-roots"
    assert decide_roots_request({"elicitation": {}}).action == "proceed-without-roots"
    assert not may_invoke_roots_list({})


# ─── AC-32.7 — requested via input-required result, supplied on retry ──────────

class TestRequestVehicle:
  def test_embedded_input_request_uses_roots_list(self):
    assert is_valid_roots_list_input_request({"method": "roots/list"})

  def test_input_request_shape_has_no_id_or_jsonrpc(self):
    # roots/list never travels as a standalone request; a bare method object is embedded.
    assert is_valid_roots_list_input_request({"method": ROOTS_LIST_METHOD})

  def test_client_supplies_list_roots_result_lenient_form(self):
    # The S17 lenient form (multi_round_trip) validates only the array's presence.
    assert is_valid_list_roots_result({"roots": [{"uri": FILE_URI}]})


# ─── AC-32.8 — method present, string, exactly "roots/list" (case-sensitive) ───

class TestRootsListMethod:
  def test_accepts_exact_method(self):
    assert is_roots_list_method("roots/list")
    assert ROOTS_LIST_METHOD == "roots/list"
    assert is_valid_roots_list_input_request({"method": "roots/list"})

  def test_rejects_miscased_or_wrong_method(self):
    assert not is_roots_list_method("Roots/List")
    assert not is_roots_list_method("roots/List")
    assert not is_roots_list_method("ROOTS/LIST")
    assert not is_roots_list_method("roots/get")
    assert not is_roots_list_method(42)
    assert not is_valid_roots_list_input_request({"method": "Roots/List"})


# ─── AC-32.9 — params carries only _meta; absence tolerated ────────────────────

class TestRootsListInputRequestParams:
  def test_accepts_no_params(self):
    assert is_valid_roots_list_input_request({"method": "roots/list"})

  def test_accepts_params_with_only_meta(self):
    assert is_valid_roots_list_input_request(
      {"method": "roots/list", "params": {"_meta": {"io.example/trace": "abc"}}}
    )

  def test_accepts_empty_params(self):
    assert is_valid_roots_list_input_request({"method": "roots/list", "params": {}})

  def test_rejects_non_object_params(self):
    assert not is_valid_roots_list_input_request({"method": "roots/list", "params": 5})
    assert not is_valid_roots_list_input_request({"method": "roots/list", "params": []})

  def test_rejects_non_object_value(self):
    assert not is_valid_roots_list_input_request("roots/list")
    assert not is_valid_roots_list_input_request({"method": "other"})


# ─── AC-32.10 — ListRootsResult: roots present (MAY be empty), missing invalid ─

class TestListRootsResult:
  def test_accepts_empty_array(self):
    assert is_valid_strict_list_roots_result({"roots": []})

  def test_accepts_populated_array(self):
    assert is_valid_strict_list_roots_result(
      {
        "roots": [
          {"uri": "file:///home/user/projects/myproject", "name": "My Project"},
          {"uri": "file:///home/user/repos/backend", "name": "Backend Repository"},
        ]
      }
    )

  def test_rejects_missing_roots(self):
    assert not is_valid_strict_list_roots_result({})
    assert not is_valid_strict_list_roots_result({"notRoots": []})

  def test_rejects_non_object(self):
    assert not is_valid_strict_list_roots_result([])
    assert not is_valid_strict_list_roots_result("x")

  def test_rejects_invalid_root_uri(self):
    assert not is_valid_strict_list_roots_result({"roots": [{"uri": "http://x"}]})
    assert not is_valid_strict_list_roots_result({"roots": [{"name": "no uri"}]})


# ─── AC-32.11 — Root.uri present, file://, valid RFC 3986; else fails ──────────

class TestFileUri:
  def test_accepts_valid_file_uri(self):
    assert is_valid_file_uri("file:///home/user/projects/myproject")
    assert is_valid_file_uri("file:///")
    assert is_valid_file_uri("file:///home/user")
    assert is_valid_file_uri("file://host/path")

  def test_rejects_non_file_scheme(self):
    assert not is_valid_file_uri("http://example.com")
    assert not is_valid_file_uri("https://example.com/a")
    assert not is_valid_file_uri("ftp://host/x")

  def test_rejects_malformed_or_non_string(self):
    assert not is_valid_file_uri("file:// not a uri \\ %")
    assert not is_valid_file_uri("not-a-uri")
    assert not is_valid_file_uri("")
    assert not is_valid_file_uri("file:/single-slash")
    assert not is_valid_file_uri(42)
    assert not is_valid_file_uri(None)
    assert not is_valid_file_uri("relative/path")

  def test_rejects_malformed_percent_escape(self):
    # A "%" not followed by two hex digits is not a syntactically valid URI. (R-21.1.5-d)
    assert not is_valid_file_uri("file:///home/%zz/x")
    assert not is_valid_file_uri("file:///home/%2/x")
    assert not is_valid_file_uri("file:///home/trailing%")

  def test_rejects_space_and_control_chars(self):
    assert not is_valid_file_uri("file:///home/with space")
    assert not is_valid_file_uri("file:///home/back\\slash")
    assert not is_valid_file_uri("file:///home/\ttab")


# ─── AC-32.12 — non-file root may be rejected or ignored (both conformant) ─────

class TestNonFileDisposition:
  def test_conformant_dispositions(self):
    assert is_conformant_non_file_disposition("reject")
    assert is_conformant_non_file_disposition("ignore")
    assert not is_conformant_non_file_disposition("accept")
    assert not is_conformant_non_file_disposition("crash")
    assert not is_conformant_non_file_disposition("keep")

  def test_apply_drops_non_file_keeps_file(self):
    assert apply_non_file_disposition("http://x", "reject") == {
      "kept": False,
      "disposition": "reject",
    }
    assert apply_non_file_disposition("http://x", "ignore") == {
      "kept": False,
      "disposition": "ignore",
    }
    assert apply_non_file_disposition(FILE_URI, "reject") == {
      "kept": True,
      "disposition": "reject",
    }
    assert apply_non_file_disposition(FILE_URI, "ignore") == {
      "kept": True,
      "disposition": "ignore",
    }


# ─── AC-32.13 — Root.name is an optional human-readable string ─────────────────

class TestRootName:
  def test_accepts_present_string_name(self):
    assert is_valid_root({"uri": FILE_URI, "name": "My Project"})

  def test_accepts_absent_name(self):
    assert is_valid_root({"uri": FILE_URI})

  def test_rejects_non_string_name(self):
    assert not is_valid_root({"uri": FILE_URI, "name": 42})


# ─── AC-32.14 — unrecognized Root._meta / top-level members ignored ────────────

class TestRootMeta:
  def test_accepts_unknown_meta_members(self):
    assert is_valid_root(
      {"uri": FILE_URI, "_meta": {"io.example/unknown": {"deep": True}, "future": 123}}
    )

  def test_accepts_unknown_top_level_members(self):
    assert is_valid_root({"uri": FILE_URI, "futureField": "x"})

  def test_rejects_non_object_meta(self):
    assert not is_valid_root({"uri": FILE_URI, "_meta": 5})


class TestRoot:
  def test_valid(self):
    assert is_valid_root({"uri": "file:///x", "name": "X", "_meta": {}})

  def test_invalid(self):
    assert not is_valid_root({"uri": "https://x"})
    assert not is_valid_root({"name": "X"})
    assert not is_valid_root({"uri": "file:///x", "name": 1})
    assert not is_valid_root("not-a-dict")


# ─── AC-32.15 — client exposes only in-scope, consented roots ──────────────────

class TestAssemblyScopeConsent:
  def test_includes_only_in_scope_and_consented(self):
    candidates = [
      RootCandidate(root={"uri": "file:///a"}, in_scope=True, consented=True),
      RootCandidate(root={"uri": "file:///b"}, in_scope=False, consented=True),
      RootCandidate(root={"uri": "file:///c"}, in_scope=True, consented=False),
    ]
    out = assemble_list_roots_result(candidates)
    assert [r["uri"] for r in out.result["roots"]] == ["file:///a"]
    assert {"root": {"uri": "file:///b"}, "reason": "not-in-scope"} in out.excluded
    assert {"root": {"uri": "file:///c"}, "reason": "no-consent"} in out.excluded

  def test_conformant_empty_listing_when_nothing_qualifies(self):
    candidates = [
      RootCandidate(root={"uri": "file:///x"}, in_scope=False, consented=False),
    ]
    assert assemble_list_roots_result(candidates).result == {"roots": []}

  def test_includes_qualifying(self):
    out = assemble_list_roots_result(
      [RootCandidate(root={"uri": "file:///ok"}, consented=True, in_scope=True)]
    )
    assert out.result == {"roots": [{"uri": "file:///ok"}]}
    assert out.excluded == []


# ─── AC-32.16 — client guards against path-traversal artifacts ─────────────────

class TestPathTraversal:
  def test_flags_literal_dotdot_segment(self):
    assert not is_path_traversal_safe("file:///home/user/../etc/passwd")
    assert not is_path_traversal_safe("file:///a/b/..")

  def test_flags_percent_encoded_dotdot(self):
    assert not is_path_traversal_safe("file:///home/%2e%2e/etc")
    assert not is_path_traversal_safe("file:///home/%2E%2E/etc")

  def test_accepts_clean_path(self):
    assert is_path_traversal_safe("file:///home/user/projects/myproject")
    assert is_path_traversal_safe("file:///home/user")

  def test_rejects_invalid_uri(self):
    assert not is_path_traversal_safe("http://x")
    assert not is_path_traversal_safe("not-a-uri")

  def test_excludes_traversal_candidate_during_assembly(self):
    candidates = [
      RootCandidate(root={"uri": "file:///home/../etc"}, in_scope=True, consented=True),
      RootCandidate(root={"uri": "file:///home/user/ok"}, in_scope=True, consented=True),
    ]
    out = assemble_list_roots_result(candidates)
    assert [r["uri"] for r in out.result["roots"]] == ["file:///home/user/ok"]
    assert {"root": {"uri": "file:///home/../etc"}, "reason": "path-traversal"} in out.excluded

  def test_excludes_invalid_uri_candidate_during_assembly(self):
    candidates = [
      RootCandidate(root={"uri": "http://nope"}, in_scope=True, consented=True),
    ]
    out = assemble_list_roots_result(candidates)
    assert out.result["roots"] == []
    assert {"root": {"uri": "http://nope"}, "reason": "invalid-uri"} in out.excluded

  def test_excludes_with_all_four_reasons(self):
    out = assemble_list_roots_result(
      [
        RootCandidate(root={"uri": "file:///a"}, consented=True, in_scope=False),
        RootCandidate(root={"uri": "file:///b"}, consented=False, in_scope=True),
        RootCandidate(root={"uri": "https://c"}, consented=True, in_scope=True),
        RootCandidate(root={"uri": "file:///d/../e"}, consented=True, in_scope=True),
      ]
    )
    reasons = {e["reason"] for e in out.excluded}
    assert reasons == {"not-in-scope", "no-consent", "invalid-uri", "path-traversal"}
    assert out.result == {"roots": []}


# ─── AC-32.17 — server tolerates a reported root becoming unavailable ──────────

class TestToleranceUnavailable:
  def test_tolerates_unavailable_root(self):
    assert should_tolerate_unavailable_root({"uri": FILE_URI})
    assert should_tolerate_unavailable_root({"uri": "file:///gone", "name": "Gone"})


# ─── AC-32.18 — server validates derived paths; protocol does NOT enforce ──────

class TestServerSide:
  def test_non_enforcement(self):
    assert PROTOCOL_ENFORCES_ROOT_BOUNDARIES is False
    assert not protocol_enforces_root_boundaries()

  def test_accepts_path_within_reported_root(self):
    roots = [{"uri": "file:///home/user/project"}]
    assert is_path_within_reported_roots("file:///home/user/project", roots)
    assert is_path_within_reported_roots("file:///home/user/project/src/index.ts", roots)

  def test_rejects_path_outside_every_root(self):
    roots = [{"uri": "file:///home/user/project"}]
    assert not is_path_within_reported_roots("file:///etc/passwd", roots)
    # sibling that shares a prefix string but not a path segment
    assert not is_path_within_reported_roots("file:///home/user/projectile", roots)

  def test_rejects_non_file_or_malformed_derived_and_skips_invalid_roots(self):
    roots = [{"uri": "file:///home/user/project"}]
    assert not is_path_within_reported_roots("http://x", roots)
    assert not is_path_within_reported_roots(
      "file:///home/user/project", [{"uri": "http://bad"}]
    )

  def test_path_within_roots_segment_prefix(self):
    roots = [{"uri": "file:///home/user"}]
    assert is_path_within_reported_roots("file:///home/user/doc.txt", roots)
    assert is_path_within_reported_roots("file:///home/user", roots)
    assert not is_path_within_reported_roots("file:///etc/passwd", roots)
    assert not is_path_within_reported_roots("file:///home/userdata", roots)
