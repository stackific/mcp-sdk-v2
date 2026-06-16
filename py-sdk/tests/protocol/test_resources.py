"""Tests for Resources I — capability, URIs, types, listing (§17.1–§17.4)."""

import pytest

from mcp.protocol.resources import (
  RESOURCE_GATED_METHODS,
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_LIST_METHOD,
  RESOURCES_TEMPLATES_LIST_METHOD,
  RESOURCES_UPDATED_METHOD,
  ListCacheHints,
  build_list_resources_result,
  build_list_resource_templates_result,
  build_resources_capability,
  client_may_issue_resource_request,
  get_resources_capability,
  is_resource_uri,
  is_uri_template,
  is_valid_list_resource_templates_request,
  is_valid_list_resource_templates_result,
  is_valid_list_resources_request,
  is_valid_list_resources_request_params,
  is_valid_list_resources_result,
  is_valid_resource,
  is_valid_resource_template,
  is_valid_resources_capability,
  may_accept_resource_request,
  may_emit_resource_updated,
  may_emit_resources_list_changed,
  resource_display_name,
  resource_template_display_name,
  resource_template_has_no_size,
  server_declares_resources,
  uri_template_variables,
)


SAMPLE_RESOURCE = {
  "uri": "file:///project/README.md",
  "name": "readme",
  "title": "Project README",
  "description": "Top-level project documentation.",
  "mimeType": "text/markdown",
  "size": 4096,
}
SAMPLE_TEMPLATE = {
  "uriTemplate": "db://{table}/{id}",
  "name": "db-row",
  "title": "Database Row",
  "description": "A single row addressed by table and primary key.",
  "mimeType": "application/json",
}


class TestMethodNameConstants:
  def test_discovery_method_names(self):
    assert RESOURCES_LIST_METHOD == "resources/list"
    assert RESOURCES_TEMPLATES_LIST_METHOD == "resources/templates/list"

  def test_notification_name_constants(self):
    assert RESOURCES_LIST_CHANGED_METHOD == "notifications/resources/list_changed"
    assert RESOURCES_UPDATED_METHOD == "notifications/resources/updated"


class TestCapabilityDeclaration:
  def test_valid_capability_shapes(self):
    assert is_valid_resources_capability({})
    assert is_valid_resources_capability({"listChanged": True})
    assert is_valid_resources_capability({"listChanged": True, "subscribe": False})

  def test_invalid_sub_flag_types(self):
    assert not is_valid_resources_capability({"listChanged": "yes"})
    assert not is_valid_resources_capability({"subscribe": 1})
    assert not is_valid_resources_capability("not a dict")

  def test_server_declares_and_accessor(self):
    assert get_resources_capability({}) is None
    assert not server_declares_resources({})
    assert get_resources_capability({"resources": {}}) == {}
    assert server_declares_resources({"resources": {}})

  def test_build_capability(self):
    assert build_resources_capability() == {}
    assert build_resources_capability(list_changed=True) == {"listChanged": True}
    assert build_resources_capability(subscribe=True) == {"subscribe": True}
    assert build_resources_capability(list_changed=True, subscribe=True) == {"listChanged": True, "subscribe": True}

  def test_build_capability_omits_false_flags(self):
    assert build_resources_capability(list_changed=False, subscribe=False) == {}


class TestCapabilityGating:
  def test_gated_methods_list(self):
    assert list(RESOURCE_GATED_METHODS) == ["resources/list", "resources/templates/list", "resources/read"]

  def test_gated_methods(self):
    assert may_accept_resource_request("resources/read", {"resources": {}})
    assert may_accept_resource_request("resources/list", {"resources": {}})
    assert not may_accept_resource_request("resources/read", {})
    assert not may_accept_resource_request("tools/call", {"resources": {}})
    assert client_may_issue_resource_request("resources/list", {"resources": {}})

  def test_all_gated_methods_undeclared(self):
    for method in RESOURCE_GATED_METHODS:
      assert not may_accept_resource_request(method, {})
      assert not client_may_issue_resource_request(method, {})

  def test_all_gated_methods_declared(self):
    caps = {"resources": {}}
    for method in RESOURCE_GATED_METHODS:
      assert may_accept_resource_request(method, caps)
      assert client_may_issue_resource_request(method, caps)

  def test_non_resource_method_never_accepted(self):
    assert not may_accept_resource_request("tools/list", {"resources": {}})

  def test_notification_gating(self):
    assert may_emit_resources_list_changed({"resources": {"listChanged": True}})
    assert not may_emit_resources_list_changed({"resources": {}})
    assert may_emit_resource_updated({"resources": {"subscribe": True}})
    assert not may_emit_resource_updated({"resources": {}})

  def test_notification_requires_capability(self):
    assert not may_emit_resources_list_changed({})
    assert not may_emit_resource_updated({})

  def test_sub_flags_are_independent(self):
    # listChanged alone does not permit updated, and vice versa.
    assert not may_emit_resource_updated({"resources": {"listChanged": True}})
    assert not may_emit_resources_list_changed({"resources": {"subscribe": True}})
    both = {"resources": {"listChanged": True, "subscribe": True}}
    assert may_emit_resources_list_changed(both)
    assert may_emit_resource_updated(both)


class TestListRequests:
  def test_params_optional_and_empty(self):
    assert is_valid_list_resources_request_params({})
    assert is_valid_list_resources_request_params({"cursor": "eyJwYWdlIjoyfQ=="})
    assert is_valid_list_resources_request_params({"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}})

  def test_params_reject_non_string_cursor(self):
    assert not is_valid_list_resources_request_params({"cursor": 2})
    assert not is_valid_list_resources_request_params({"_meta": "no"})
    assert not is_valid_list_resources_request_params("not a dict")

  def test_request_envelope(self):
    assert is_valid_list_resources_request({"method": "resources/list"})
    assert is_valid_list_resources_request({"method": "resources/list", "params": {"cursor": "20"}})
    assert not is_valid_list_resources_request({"method": "resources/templates/list"})
    assert not is_valid_list_resources_request({"method": "resources/list", "params": {"cursor": 1}})

  def test_templates_request_envelope(self):
    assert is_valid_list_resource_templates_request({"method": "resources/templates/list", "params": {"cursor": "eyJwYWdlIjoyfQ=="}})
    assert not is_valid_list_resource_templates_request({"method": "resources/list"})


class TestUri:
  def test_valid_resource_uri(self):
    assert is_resource_uri("file:///path")
    assert is_resource_uri("https://example.com/x")
    assert is_resource_uri("urn:isbn:0451450523")
    assert is_resource_uri("custom-app.v2://x")

  def test_invalid_resource_uri(self):
    assert not is_resource_uri("/relative/path")
    assert not is_resource_uri("noscheme")
    assert not is_resource_uri(123)
    assert not is_resource_uri("")
    assert not is_resource_uri("not a uri")

  def test_any_scheme_accepted(self):
    # uri MAY use any scheme (RFC3986), mirroring the TS isResourceUri cases.
    for uri in ("file:///a", "https://h/p", "db://users/42", "urn:isbn:0451450523", "custom-scheme:thing"):
      assert is_resource_uri(uri)

  def test_whatwg_parity_special_scheme_empty_host(self):
    # Parity with the TS WHATWG `new URL()` parser: a non-`file` special scheme MUST
    # carry a non-empty host, while `file:` (and any custom scheme) may omit it.
    assert is_resource_uri("file:")  # special, but empty host allowed
    assert is_resource_uri("file://")
    assert is_resource_uri("file:x")
    assert is_resource_uri("db://")  # custom scheme, empty host allowed
    assert is_resource_uri("custom:")
    assert is_resource_uri("https:x")  # host re-parsed to `x`
    assert not is_resource_uri("http://")  # special + empty host → invalid
    assert not is_resource_uri("https://")
    assert not is_resource_uri("https:")
    assert not is_resource_uri("ws://")
    assert not is_resource_uri("ftp://")


class TestUriTemplate:
  def test_valid(self):
    assert is_uri_template("file:///{path}")
    assert is_uri_template("db://{table}/{id}")
    assert is_uri_template("x://{+var}")
    assert is_uri_template("x://{var:3}")
    assert is_uri_template("x://{list*}")

  def test_invalid(self):
    assert not is_uri_template("x://{}")
    assert not is_uri_template("x://{unclosed")
    assert not is_uri_template("x://closed}")
    assert not is_uri_template("x://{a{b}}")

  def test_variables_extraction(self):
    assert uri_template_variables("db://{table}/{id}") == ["table", "id"]
    assert uri_template_variables("x://{+path}/{path}") == ["path"]  # dedup
    assert uri_template_variables("x://{a:3}/{b*}") == ["a", "b"]
    assert uri_template_variables("no/vars") == []


class TestUriTemplateExtras:
  def test_accepts_operators_and_literal_only(self):
    for template in ("file:///{path}", "db://{table}/{id}", "https://api/{+base}/items{?q,page}", "x://{var:3}", "y://{list*}"):
      assert is_uri_template(template)
    assert is_uri_template("file:///fixed/path")  # literal-only, no expressions

  def test_rejects_malformed(self):
    for template in ("db://{table", "db://table}", "db://{}/x", "db://{ }", "db://{a{b}}", ""):
      assert not is_uri_template(template)

  def test_variables_with_operators_and_lists(self):
    assert uri_template_variables("https://api/{+base}/items{?q,page}") == ["base", "q", "page"]
    assert uri_template_variables("x://{var:3}/{list*}") == ["var", "list"]

  def test_expanded_template_is_resource_uri(self):
    expanded = "db://{table}/{id}".replace("{table}", "users").replace("{id}", "42")
    assert expanded == "db://users/42"
    assert is_resource_uri(expanded)


class TestTypes:
  def test_valid_resource(self):
    assert is_valid_resource({"name": "r", "uri": "file:///r"})
    assert is_valid_resource({"name": "r", "uri": "file:///r", "size": 10, "mimeType": "text/plain", "annotations": {"priority": 1}})

  def test_invalid_resource(self):
    assert not is_valid_resource({"name": "r"})  # no uri
    assert not is_valid_resource({"uri": "file:///r"})  # no name
    assert not is_valid_resource({"name": "r", "uri": "file:///r", "size": "big"})

  def test_resource_uri_may_use_any_scheme(self):
    for uri in ("file:///a", "https://h/p", "db://users/42", "urn:isbn:0451450523", "custom-scheme:thing"):
      assert is_valid_resource({"uri": uri, "name": "n"})

  def test_resource_rejects_uri_without_scheme(self):
    assert not is_valid_resource({"uri": "/project/README.md", "name": "n"})
    assert not is_valid_resource({"uri": "README.md", "name": "n"})

  def test_resource_size_optional_numeric(self):
    assert is_valid_resource({"uri": "file:///x", "name": "x"})  # size absent ok
    assert is_valid_resource({"uri": "file:///x", "name": "x", "size": 4096})
    assert not is_valid_resource({"uri": "file:///x", "name": "x", "size": "4096"})

  def test_full_descriptor_fields(self):
    full = {
      "uri": "file:///x",
      "name": "x",
      "title": "X",
      "description": "desc",
      "mimeType": "text/plain",
      "size": 10,
      "annotations": {"audience": ["user"], "priority": 0.5, "lastModified": "2025-01-12T15:00:58Z"},
      "icons": [{"src": "https://example.com/icon.png"}],
      "_meta": {"foo": "bar"},
    }
    assert is_valid_resource(full)

  def test_resource_display_name_precedence(self):
    assert resource_display_name({"name": "readme", "title": "Project README"}) == "Project README"
    assert resource_display_name({"name": "readme"}) == "readme"
    assert resource_display_name({"name": "readme", "title": ""}) == "readme"

  def test_valid_template(self):
    assert is_valid_resource_template({"name": "t", "uriTemplate": "x://{id}"})
    assert not is_valid_resource_template({"name": "t", "uriTemplate": "x://{}"})

  def test_template_missing_required_fields(self):
    assert not is_valid_resource_template({"uriTemplate": "x://{a}"})  # no name
    assert not is_valid_resource_template({"name": "t"})  # no uriTemplate

  def test_template_full_descriptor_fields(self):
    full = {
      "uriTemplate": "db://{table}/{id}",
      "name": "db-row",
      "title": "Database Row",
      "description": "A single row.",
      "mimeType": "application/json",
      "annotations": {"priority": 1},
      "icons": [{"src": "https://example.com/i.png"}],
      "_meta": {"k": "v"},
    }
    assert is_valid_resource_template(full)

  def test_template_display_name_precedence(self):
    assert resource_template_display_name({"name": "db-row", "title": "Database Row"}) == "Database Row"
    assert resource_template_display_name({"name": "db-row"}) == "db-row"

  def test_template_has_no_size(self):
    assert resource_template_has_no_size({"name": "t", "uriTemplate": "x://{id}"})
    assert not resource_template_has_no_size({"name": "t", "uriTemplate": "x://{id}", "size": 1})


class TestListResults:
  def test_build_and_validate_resources(self):
    result = build_list_resources_result([{"name": "r", "uri": "file:///r"}], ListCacheHints(0, "private"))
    assert is_valid_list_resources_result(result) and result["resultType"] == "complete"

  def test_builder_sets_result_type_complete(self):
    result = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(60000, "private"))
    assert result["resultType"] == "complete"

  def test_empty_resources_array_valid(self):
    result = build_list_resources_result([], ListCacheHints(0, "public"))
    assert result["resources"] == []
    assert is_valid_list_resources_result(result)

  def test_carries_current_set(self):
    result = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(60000, "private"))
    assert len(result["resources"]) == 1
    assert result["resources"][0]["uri"] == "file:///project/README.md"

  def test_pure_function_same_inputs_same_set(self):
    a = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(0, "public"))
    b = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(0, "public"))
    assert a["resources"] == b["resources"]

  def test_set_may_vary_by_authorization(self):
    scoped = {"uri": "doc:///secret", "name": "secret"}
    admin = build_list_resources_result([SAMPLE_RESOURCE, scoped], ListCacheHints(0, "private"))
    user = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(0, "private"))
    assert len(admin["resources"]) == 2 and len(user["resources"]) == 1

  def test_optional_fields(self):
    result = build_list_resources_result([], ListCacheHints(5, "public"), next_cursor="2", meta={"k": 1})
    assert result["nextCursor"] == "2" and result["_meta"] == {"k": 1}

  def test_next_cursor_absent_means_complete(self):
    result = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(0, "public"))
    assert "nextCursor" not in result
    assert is_valid_list_resources_result(result)

  def test_empty_string_next_cursor_is_present(self):
    result = build_list_resources_result([], ListCacheHints(0, "public"), next_cursor="")
    assert result["nextCursor"] == ""
    assert "nextCursor" in result

  def test_negative_ttl_raises(self):
    with pytest.raises(ValueError):
      build_list_resources_result([], ListCacheHints(-1, "public"))

  def test_both_cache_scopes_accepted(self):
    for scope in ("public", "private"):
      result = build_list_resources_result([], ListCacheHints(0, scope))
      assert result["cacheScope"] == scope and is_valid_list_resources_result(result)

  def test_validate_rejects_missing_array(self):
    assert not is_valid_list_resources_result({"resultType": "complete", "ttlMs": 0, "cacheScope": "public"})

  def test_validate_rejects_negative_and_non_int_ttl(self):
    assert not is_valid_list_resources_result({"resources": [], "resultType": "complete", "ttlMs": -1, "cacheScope": "public"})
    assert not is_valid_list_resources_result({"resources": [], "resultType": "complete", "ttlMs": 1.5, "cacheScope": "public"})

  def test_validate_rejects_bad_cache_scope(self):
    assert not is_valid_list_resources_result({"resources": [], "resultType": "complete", "ttlMs": 0, "cacheScope": "shared"})

  def test_page_independence(self):
    first = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(0, "public"), next_cursor="10")
    later = build_list_resources_result([{"uri": "file:///b", "name": "b"}], ListCacheHints(0, "public"))
    assert is_valid_list_resources_result(first) and is_valid_list_resources_result(later)

  def test_templates_result(self):
    result = build_list_resource_templates_result([{"name": "t", "uriTemplate": "x://{id}"}], ListCacheHints(0, "private"))
    assert result["resourceTemplates"][0]["name"] == "t"

  def test_templates_result_required_array(self):
    assert is_valid_list_resource_templates_result({"resourceTemplates": [], "resultType": "complete", "ttlMs": 0, "cacheScope": "public"})
    assert not is_valid_list_resource_templates_result({"resultType": "complete", "ttlMs": 0, "cacheScope": "public"})

  def test_templates_result_fields_and_cursor(self):
    result = build_list_resource_templates_result([SAMPLE_TEMPLATE], ListCacheHints(0, "public"), next_cursor="c2")
    assert result["resultType"] == "complete" and result["ttlMs"] == 0 and result["cacheScope"] == "public"
    assert result["nextCursor"] == "c2"
    assert is_valid_list_resource_templates_result(result)

  def test_templates_negative_ttl_raises(self):
    with pytest.raises(ValueError):
      build_list_resource_templates_result([], ListCacheHints(-1, "public"))


class TestEndToEndWire:
  def test_resources_list_example(self):
    result = build_list_resources_result([SAMPLE_RESOURCE], ListCacheHints(60000, "private"), next_cursor="eyJwYWdlIjoyfQ==")
    assert is_valid_list_resources_result(result)
    assert result["nextCursor"] == "eyJwYWdlIjoyfQ=="

  def test_templates_list_example(self):
    result = build_list_resource_templates_result([SAMPLE_TEMPLATE], ListCacheHints(0, "public"))
    assert is_valid_list_resource_templates_result(result)
