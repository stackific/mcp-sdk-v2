"""Tests for Resources II — reading, not-found, notifications, URI schemes (§17.5–§17.9)."""

import pytest

from mcp.protocol.errors import INVALID_PARAMS_CODE
from mcp.protocol.resources_read import (
  INODE_DIRECTORY_MIME_TYPE,
  LEGACY_RESOURCE_NOT_FOUND_CODE,
  RESOURCE_NOT_FOUND_CODE,
  RESOURCE_READ_INTERNAL_ERROR_CODE,
  RESOURCE_SUBSCRIBE_REQUEST_METHODS,
  RESOURCES_READ_METHOD,
  WELL_KNOWN_URI_SCHEMES,
  ReadCacheHints,
  build_read_resource_request_params,
  build_read_resource_result,
  build_read_resource_retry_params,
  build_resource_list_changed_notification,
  build_resource_read_internal_error,
  build_resource_not_found_error,
  build_resource_updated_notification,
  is_custom_uri_scheme,
  is_https_resource_uri,
  is_input_required_read_result,
  is_resource_list_changed_notification,
  is_resource_not_found_code,
  is_resource_subscribe_request_method,
  is_resource_updated_notification,
  is_valid_read_resource_request,
  is_valid_read_resource_request_params,
  is_valid_read_resource_result,
  may_fetch_directly,
  may_notify_resource_updated,
  may_notify_resources_list_changed,
  may_read_resource,
  recommended_uri_scheme,
  should_use_https_scheme,
  uri_scheme,
)

TEXT = {"uri": "file:///r", "text": "hi"}
TEXT_URI = "file:///project/src/main.rs"
HTTPS_URI = "https://example.com/doc.txt"
# A valid base64 PNG blob (from the story wire example).
PNG_BLOB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


class TestMethodAndGating:
  def test_method_name(self):
    assert RESOURCES_READ_METHOD == "resources/read"

  def test_gating(self):
    assert may_read_resource({"resources": {}})
    assert not may_read_resource({})


class TestErrors:
  def test_not_found_code_acceptance(self):
    assert is_resource_not_found_code(RESOURCE_NOT_FOUND_CODE)
    assert is_resource_not_found_code(LEGACY_RESOURCE_NOT_FOUND_CODE)
    assert not is_resource_not_found_code(-32603)

  def test_build_not_found(self):
    err = build_resource_not_found_error("file:///x")
    assert err["code"] == RESOURCE_NOT_FOUND_CODE and err["data"]["uri"] == "file:///x"

  def test_build_internal(self):
    assert build_resource_read_internal_error()["code"] == RESOURCE_READ_INTERNAL_ERROR_CODE


class TestRequest:
  def test_build_params(self):
    assert build_read_resource_request_params("file:///r") == {"uri": "file:///r"}

  def test_build_params_omits_retry_fields_first_attempt(self):
    assert build_read_resource_request_params(TEXT_URI) == {"uri": TEXT_URI}

  def test_bad_uri_raises(self):
    with pytest.raises(TypeError):
      build_read_resource_request_params("relative")
    with pytest.raises(TypeError):
      build_read_resource_request_params("not a uri")

  def test_params_validator_minimal(self):
    assert is_valid_read_resource_request_params({"uri": TEXT_URI})

  def test_params_validator_rejects_missing_or_bad_uri(self):
    assert not is_valid_read_resource_request_params({})
    assert not is_valid_read_resource_request_params({"uri": "not a uri"})
    assert not is_valid_read_resource_request_params({"uri": "/relative/path"})
    assert not is_valid_read_resource_request_params("not a dict")

  def test_params_validator_optional_fields(self):
    assert is_valid_read_resource_request_params({
      "uri": TEXT_URI,
      "inputResponses": {"askName": {"action": "accept"}},
      "requestState": "opaque-token",
      "_meta": {"vendor/x": 1},
    })
    assert not is_valid_read_resource_request_params({"uri": TEXT_URI, "inputResponses": "bad"})
    assert not is_valid_read_resource_request_params({"uri": TEXT_URI, "requestState": 1})

  def test_uri_from_list_or_template_expansion(self):
    # A concrete list uri and an expanded-template uri are both accepted.
    assert is_valid_read_resource_request_params({"uri": "file:///project/notes/readme.txt"})
    assert is_valid_read_resource_request_params({"uri": "db://customers/42"})

  def test_request_envelope(self):
    assert is_valid_read_resource_request({"method": "resources/read", "params": {"uri": TEXT_URI}})
    assert not is_valid_read_resource_request({"method": "resources/list", "params": {"uri": TEXT_URI}})
    assert not is_valid_read_resource_request({"method": "resources/read"})  # params REQUIRED
    assert not is_valid_read_resource_request({"method": "resources/read", "params": {}})

  def test_retry_params(self):
    params = build_read_resource_retry_params("file:///r", {"in-1": {}}, {"in-1": {"x": 1}}, request_state="OPAQUE")
    assert params["inputResponses"] == {"in-1": {"x": 1}} and params["requestState"] == "OPAQUE"

  def test_retry_echoes_request_state_verbatim(self):
    state = "STATE::{opaque}::do-not-touch"
    input_requests = {"askName": {"method": "elicitation/create"}, "askAge": {"method": "elicitation/create"}}
    input_responses = {"askName": {"action": "accept"}, "askAge": {"action": "accept"}}
    params = build_read_resource_retry_params(TEXT_URI, input_requests, input_responses, state)
    assert params["uri"] == TEXT_URI
    assert params["inputResponses"] == input_responses
    assert params["requestState"] == state

  def test_retry_missing_response_raises(self):
    with pytest.raises(ValueError):
      build_read_resource_retry_params("file:///r", {"in-1": {}}, {})

  def test_retry_missing_response_names_key(self):
    with pytest.raises(ValueError, match="askAge"):
      build_read_resource_retry_params(TEXT_URI, {"askName": {}, "askAge": {}}, {"askName": {"action": "accept"}})

  def test_retry_omits_request_state_when_absent(self):
    params = build_read_resource_retry_params(TEXT_URI, {}, {})
    assert "requestState" not in params


class TestResult:
  def test_build_and_validate(self):
    result = build_read_resource_result([TEXT], ReadCacheHints(0, "private"))
    assert is_valid_read_resource_result(result)

  def test_empty_contents_raises(self):
    with pytest.raises(ValueError):
      build_read_resource_result([], ReadCacheHints(0, "private"))

  def test_negative_ttl_raises(self):
    with pytest.raises(ValueError):
      build_read_resource_result([TEXT], ReadCacheHints(-1, "private"))

  def test_invalid_result_empty_contents(self):
    assert not is_valid_read_resource_result({"resultType": "complete", "contents": [], "ttlMs": 0, "cacheScope": "private"})

  def test_input_required_variant(self):
    assert is_input_required_read_result({"resultType": "input_required"})
    assert not is_input_required_read_result({"resultType": "complete"})


class TestNotifications:
  def test_list_changed(self):
    note = build_resource_list_changed_notification()
    assert note == {"method": "notifications/resources/list_changed"}

  def test_list_changed_with_meta(self):
    note = build_resource_list_changed_notification(meta={"k": 1})
    assert note["params"]["_meta"] == {"k": 1}

  def test_updated(self):
    note = build_resource_updated_notification("file:///r", "sub-1")
    assert is_resource_updated_notification(note)
    assert note["params"]["uri"] == "file:///r"
    assert note["params"]["_meta"]["io.modelcontextprotocol/subscriptionId"] == "sub-1"

  def test_list_changed_filter_gate(self):
    assert may_notify_resources_list_changed({"resourcesListChanged": True})
    assert not may_notify_resources_list_changed({})


class TestUriSchemes:
  def test_scheme_extraction(self):
    assert uri_scheme("file:///x") == "file"
    assert uri_scheme("Custom-App.v2://x") == "custom-app.v2"
    assert uri_scheme("not a uri") is None

  def test_custom_scheme(self):
    assert is_custom_uri_scheme("myapp://x")
    assert not is_custom_uri_scheme("file:///x")
    assert not is_custom_uri_scheme("relative")

  def test_https_and_direct_fetch(self):
    assert is_https_resource_uri("https://x/y")
    assert not is_https_resource_uri("file:///x")
    assert may_fetch_directly("https://x/y")
    assert not may_fetch_directly("file:///x")

  def test_scheme_guidance(self):
    assert recommended_uri_scheme(True)["scheme"] == "https"
    assert recommended_uri_scheme(False)["scheme"] == "non-https"
    assert should_use_https_scheme(True)
    assert not should_use_https_scheme(False)

  def test_inode_directory_constant(self):
    assert INODE_DIRECTORY_MIME_TYPE == "inode/directory"


# ─── AC-27.4 — ReadResourceResult validator edges (R-17.5-i,q,r) ───────────────


class TestResultValidatorEdges:
  BASE = {
    "resultType": "complete",
    "contents": [{"uri": TEXT_URI, "mimeType": "text/x-rust", "text": "fn main() {}"}],
    "ttlMs": 60000,
    "cacheScope": "private",
  }

  def test_accepts_complete_result(self):
    assert is_valid_read_resource_result(self.BASE)

  def test_rejects_non_complete_result_type(self):
    assert not is_valid_read_resource_result({**self.BASE, "resultType": "input_required"})

  def test_requires_caching_fields(self):
    no_ttl = {k: v for k, v in self.BASE.items() if k != "ttlMs"}
    assert not is_valid_read_resource_result(no_ttl)
    assert not is_valid_read_resource_result({**self.BASE, "cacheScope": "shared"})

  def test_rejects_negative_ttl(self):
    assert not is_valid_read_resource_result({**self.BASE, "ttlMs": -1})

  def test_build_produces_valid_complete_result(self):
    built = build_read_resource_result([{"uri": TEXT_URI, "text": "fn main() {}"}], ReadCacheHints(0, "private"))
    assert built["resultType"] == "complete"
    assert is_valid_read_resource_result(built)


# ─── AC-27.5 — directory: multiple entries, differing uri (R-17.5-j,p) ──────────


class TestDirectoryContents:
  def test_multiple_entries_differing_uri(self):
    result = build_read_resource_result(
      [
        {"uri": "file:///project/notes/readme.txt", "mimeType": "text/plain", "text": "see logo.png"},
        {"uri": "file:///project/notes/logo.png", "mimeType": "image/png", "blob": PNG_BLOB},
      ],
      ReadCacheHints(0, "private"),
    )
    assert len(result["contents"]) == 2
    # Each sub-resource uri differs from the requested container uri.
    assert result["contents"][0]["uri"] != "file:///project/notes"
    assert is_valid_read_resource_result(result)


# ─── AC-27.6 — text content entry (R-17.5-k,l,s,t) ──────────────────────────────


class TestTextContentEntry:
  BASE = {"resultType": "complete", "ttlMs": 0, "cacheScope": "private"}

  def test_accepts_text_entry(self):
    result = {**self.BASE, "contents": [{"uri": TEXT_URI, "text": "hi"}]}
    assert is_valid_read_resource_result(result)

  def test_rejects_text_entry_missing_uri_or_text(self):
    assert not is_valid_read_resource_result({**self.BASE, "contents": [{"text": "hi"}]})
    assert not is_valid_read_resource_result({**self.BASE, "contents": [{"uri": TEXT_URI}]})


# ─── AC-27.7 — binary content entry (R-17.5-k,m,n,o,u,v) ────────────────────────


class TestBlobContentEntry:
  BASE = {"resultType": "complete", "ttlMs": 0, "cacheScope": "private"}

  def test_accepts_blob_entry(self):
    result = {**self.BASE, "contents": [{"uri": "file:///logo.png", "mimeType": "image/png", "blob": PNG_BLOB}]}
    assert is_valid_read_resource_result(result)

  def test_rejects_both_text_and_blob(self):
    result = {**self.BASE, "contents": [{"uri": "file:///x", "text": "x", "blob": PNG_BLOB}]}
    assert not is_valid_read_resource_result(result)

  def test_rejects_non_base64_blob(self):
    result = {**self.BASE, "contents": [{"uri": "file:///x", "blob": "not base64 !!!"}]}
    assert not is_valid_read_resource_result(result)

  def test_rejects_blob_entry_missing_uri(self):
    result = {**self.BASE, "contents": [{"blob": PNG_BLOB}]}
    assert not is_valid_read_resource_result(result)


# ─── AC-27.8 — input_required variant distinguished from complete (R-17.5-w) ────


class TestInputRequiredVariant:
  def test_recognizes_input_required(self):
    reply = {"resultType": "input_required", "requestState": "tok"}
    assert is_input_required_read_result(reply)

  def test_complete_result_is_not_input_required(self):
    done = build_read_resource_result([{"uri": TEXT_URI, "text": "x"}], ReadCacheHints(0, "private"))
    assert not is_input_required_read_result(done)


# ─── AC-27.9 — direct https fetch, incl. non-https schemes (R-17.5-y) ───────────


class TestDirectFetch:
  def test_https_may_fetch_directly(self):
    assert is_https_resource_uri(HTTPS_URI)
    assert may_fetch_directly(HTTPS_URI)

  def test_non_https_may_not_fetch_directly(self):
    assert not may_fetch_directly(TEXT_URI)
    assert not may_fetch_directly("git://repo/x")


# ─── AC-27.10 — not-found error detail (R-17.5-z,aa, R-17.6-a,b) ────────────────


class TestNotFoundDetail:
  def test_not_found_error_carries_invalid_params_and_uri(self):
    err = build_resource_not_found_error("file:///nonexistent.txt")
    assert err["code"] == -32602
    assert err["code"] == INVALID_PARAMS_CODE
    assert RESOURCE_NOT_FOUND_CODE == INVALID_PARAMS_CODE
    assert err["data"]["uri"] == "file:///nonexistent.txt"
    assert isinstance(err["message"], str)

  def test_no_empty_contents_to_signal_non_existence(self):
    with pytest.raises(ValueError):
      build_read_resource_result([], ReadCacheHints(0, "private"))


# ─── AC-27.12 — internal error (R-17.6-d) ──────────────────────────────────────


class TestInternalError:
  def test_uses_minus_32603(self):
    assert RESOURCE_READ_INTERNAL_ERROR_CODE == -32603
    assert build_resource_read_internal_error()["code"] == -32603


# ─── AC-27.13 — no subscribe/unsubscribe request method (R-17.7-a) ─────────────


class TestNoSubscribeMethod:
  def test_no_subscribe_request_method(self):
    assert RESOURCE_SUBSCRIBE_REQUEST_METHODS == ()
    assert list(RESOURCE_SUBSCRIBE_REQUEST_METHODS) == []
    assert not is_resource_subscribe_request_method("resources/subscribe")
    assert not is_resource_subscribe_request_method("resources/unsubscribe")


# ─── AC-27.14/15 — list_changed delivery & schema (R-17.7-b,c,d,e) ─────────────


class TestListChangedDelivery:
  def test_delivered_only_with_filter(self):
    assert may_notify_resources_list_changed({"resourcesListChanged": True})

  def test_withheld_without_filter(self):
    assert not may_notify_resources_list_changed({})
    assert not may_notify_resources_list_changed({"resourcesListChanged": False})

  def test_built_notification_is_valid(self):
    note = build_resource_list_changed_notification()
    assert note["method"] == "notifications/resources/list_changed"
    assert is_resource_list_changed_notification(note)
    with_meta = build_resource_list_changed_notification(meta={"vendor/x": 1})
    assert is_resource_list_changed_notification(with_meta)


# ─── AC-27.16/17 — updated notification & delivery (R-17.7-f,g,h,i,j,k) ─────────


class TestUpdatedDelivery:
  def test_built_notification_is_valid(self):
    note = build_resource_updated_notification(TEXT_URI, "4")
    assert note["method"] == "notifications/resources/updated"
    assert note["params"]["uri"] == TEXT_URI
    assert note["params"]["_meta"]["io.modelcontextprotocol/subscriptionId"] == "4"
    assert is_resource_updated_notification(note)

  def test_may_deliver_exact_match(self):
    assert may_notify_resource_updated(TEXT_URI, {"resourceSubscriptions": [TEXT_URI]})

  def test_may_deliver_sub_resource(self):
    f = {"resourceSubscriptions": ["file:///project/src"]}
    assert may_notify_resource_updated("file:///project/src/main.rs", f)

  def test_no_update_for_unsubscribed(self):
    f = {"resourceSubscriptions": ["file:///project/src"]}
    assert not may_notify_resource_updated("file:///other/file.txt", f)

  def test_no_update_without_any_subscription(self):
    assert not may_notify_resource_updated(TEXT_URI, {})


# ─── AC-27.18 — scheme registry & custom schemes (R-17.9-a,e,f) ────────────────


class TestSchemeRegistry:
  def test_well_known_schemes(self):
    assert list(WELL_KNOWN_URI_SCHEMES) == ["https", "file", "git"]

  def test_scheme_extraction(self):
    assert uri_scheme("FILE:///x") == "file"
    assert uri_scheme("custom-app.v2://x") == "custom-app.v2"
    assert uri_scheme("not a uri") is None

  def test_custom_scheme_recognition(self):
    assert is_custom_uri_scheme("myapp://thing/1")
    assert not is_custom_uri_scheme("file:///x")  # well-known, not custom
    assert not is_custom_uri_scheme("git://repo/x")  # well-known, not custom
    assert not is_custom_uri_scheme("relative/ref")  # not RFC3986 (no scheme)


# ─── AC-27.20 — file:// non-regular file MIME (R-17.9-d) ───────────────────────


class TestInodeDirectoryMime:
  def test_directory_entry_may_carry_inode_directory(self):
    result = build_read_resource_result(
      [{"uri": "file:///project/notes", "mimeType": INODE_DIRECTORY_MIME_TYPE, "text": ""}],
      ReadCacheHints(0, "private"),
    )
    assert result["contents"][0]["mimeType"] == "inode/directory"
