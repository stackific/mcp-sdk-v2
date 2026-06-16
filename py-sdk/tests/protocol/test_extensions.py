"""Tests for S11 — The Extensions Map & Forward Compatibility (§6.5–§6.7).

Mirrors ``ts-sdk/src/__tests__/protocol/extensions.test.ts``. AC coverage:

* AC-11.1  (R-6.5-a) — identifier with no prefix is malformed
* AC-11.2  (R-6.5-b) — prefix label start/end character rules
* AC-11.3  (R-6.5-c) — interior hyphen in a prefix label is allowed
* AC-11.4  (R-6.5-d) — reverse-DNS prefix is well-formed (recommended)
* AC-11.5  (R-6.5-e) — name start/end alphanumeric; empty name allowed
* AC-11.6  (R-6.5-f) — name interior hyphen/underscore/dot/alnum allowed
* AC-11.7  (R-6.5-g) — reserved second label (modelcontextprotocol/mcp)
* AC-11.8  (R-6.5-h) — ``{}`` means enabled-no-settings, not absent
* AC-11.9  (R-6.5-i) — producer map has no ``None`` values
* AC-11.10 (R-6.5-j) — ``None`` entry is malformed → ignored / not advertised
* AC-11.11 (R-6.5-k) — unknown settings keys ignored by the extension
* AC-11.12 (R-6.5-l) — active only in the intersection; no unilateral use
* AC-11.13 (R-6.5-m) — disabled by default (not advertised unless enabled)
* AC-11.14 (R-6.5-n) — one-sided support → fallback or reject-if-mandatory
* AC-11.15..21 (R-6.6) — forward compatibility (tolerate/ignore unknown things)
* AC-11.22 (R-6.7-a) — §6.7 worked example: active only on mutual advertisement
"""

import pytest

from mcp.protocol.extensions import (
  KNOWN_CLIENT_CAPABILITY_FIELDS,
  KNOWN_SERVER_CAPABILITY_FIELDS,
  ParsedExtensionId,
  decide_extension_fallback,
  get_extension_settings,
  ignore_unknown_capability_fields,
  intersect_extensions,
  is_extension_active,
  is_extension_advertised,
  is_extension_settings,
  is_reserved_extension_prefix,
  is_third_party_usable,
  is_valid_extension_id,
  is_valid_extension_name,
  is_valid_extension_prefix,
  is_valid_extensions_map,
  normalize_extensions_map,
  parse_extension_id,
  pick_known_settings,
  unknown_capability_fields,
)


# ─── AC-11.1 (R-6.5-a): prefix is REQUIRED ─────────────────────────────────────


class TestPrefixRequired:
  def test_rejects_identifier_with_no_prefix(self):
    # The empty string before the slash is not a valid prefix.
    assert is_valid_extension_id("/tasks") is False

  def test_rejects_identifier_with_no_slash(self):
    assert parse_extension_id("tasks") is None
    assert is_valid_extension_id("tasks") is False

  def test_accepts_identifier_with_prefix(self):
    assert is_valid_extension_id("com.example/tasks") is True


# ─── AC-11.2 (R-6.5-b): prefix label start/end characters ──────────────────────


class TestPrefixLabelStartEnd:
  def test_rejects_label_not_starting_with_letter(self):
    assert is_valid_extension_prefix("1com") is False
    assert is_valid_extension_id("1com/x") is False

  def test_rejects_label_not_ending_letter_or_digit(self):
    assert is_valid_extension_prefix("com-") is False
    assert is_valid_extension_id("com-/x") is False

  def test_accepts_letter_start_letter_end(self):
    assert is_valid_extension_prefix("com") is True
    assert is_valid_extension_id("com/x") is True

  def test_accepts_label_ending_in_digit(self):
    assert is_valid_extension_prefix("ipv6") is True

  def test_accepts_single_letter_label(self):
    assert is_valid_extension_prefix("a") is True


# ─── AC-11.3 (R-6.5-c): interior hyphen ────────────────────────────────────────


class TestInteriorHyphen:
  def test_accepts_interior_hyphen(self):
    assert is_valid_extension_prefix("my-org") is True
    assert is_valid_extension_id("my-org/ext") is True

  def test_rejects_leading_or_trailing_hyphen(self):
    assert is_valid_extension_prefix("-org") is False
    assert is_valid_extension_prefix("org-") is False


# ─── AC-11.4 (R-6.5-d): reverse-DNS recommended ────────────────────────────────


class TestReverseDns:
  def test_accepts_reverse_dns_with_hyphenated_name(self):
    assert is_valid_extension_prefix("com.example") is True
    assert is_valid_extension_id("com.example/my-extension") is True

  def test_accepts_multi_label_reverse_dns(self):
    assert is_valid_extension_prefix("org.example.api") is True
    assert is_valid_extension_id("org.example.api/thing") is True

  def test_rejects_empty_label_from_double_dot(self):
    assert is_valid_extension_prefix("com..example") is False
    assert is_valid_extension_prefix(".com") is False
    assert is_valid_extension_prefix("com.") is False


# ─── AC-11.5 (R-6.5-e): name start/end alphanumeric; empty allowed ─────────────


class TestNameStartEnd:
  def test_rejects_name_not_beginning_alphanumeric(self):
    assert is_valid_extension_name("-tasks") is False
    assert is_valid_extension_id("com.example/-tasks") is False

  def test_rejects_name_not_ending_alphanumeric(self):
    assert is_valid_extension_name("tasks-") is False
    assert is_valid_extension_id("com.example/tasks-") is False

  def test_accepts_alphanumeric_bounded_name(self):
    assert is_valid_extension_name("oauth-client-credentials") is True
    assert is_valid_extension_id("io.modelcontextprotocol/oauth-client-credentials") is True

  def test_permits_empty_name_after_slash(self):
    assert is_valid_extension_name("") is True
    assert parse_extension_id("com.example/") == ParsedExtensionId("com.example", "")
    assert is_valid_extension_id("com.example/") is True


# ─── AC-11.6 (R-6.5-f): name interior characters ───────────────────────────────


class TestNameInterior:
  def test_accepts_hyphen_underscore_dot_alnum_interior(self):
    assert is_valid_extension_name("oauth-client_credentials.v2") is True
    assert is_valid_extension_id("com.example/oauth-client_credentials.v2") is True

  def test_rejects_forbidden_interior_char(self):
    assert is_valid_extension_name("bad name") is False
    # A second slash lands inside the name and makes it invalid.
    assert is_valid_extension_id("com.example/a/b") is False

  def test_parse_splits_on_first_slash_only(self):
    # Later slashes are kept in the name so the validator rejects them.
    assert parse_extension_id("com.example/a/b") == ParsedExtensionId("com.example", "a/b")


# ─── AC-11.7 (R-6.5-g): reserved second label ──────────────────────────────────


class TestReservedSecondLabel:
  @pytest.mark.parametrize(
    "identifier",
    [
      "io.modelcontextprotocol/x",
      "dev.mcp/x",
      "org.modelcontextprotocol.api/x",
      "com.mcp/x",
    ],
  )
  def test_reserved_not_third_party_usable(self, identifier):
    parsed = parse_extension_id(identifier)
    assert parsed is not None
    assert is_reserved_extension_prefix(parsed.prefix) is True
    assert is_third_party_usable(identifier) is False
    # Reserved identifiers are still WELL-FORMED.
    assert is_valid_extension_id(identifier) is True

  def test_com_example_mcp_not_reserved(self):
    parsed = parse_extension_id("com.example.mcp/x")
    assert parsed is not None
    assert is_reserved_extension_prefix(parsed.prefix) is False
    assert is_third_party_usable("com.example.mcp/x") is True

  def test_single_label_prefix_not_reserved(self):
    # `mcp` as a single label has no second label, so the rule does not apply.
    assert is_reserved_extension_prefix("mcp") is False

  def test_malformed_is_not_third_party_usable(self):
    assert is_third_party_usable("nope") is False
    assert is_third_party_usable("com.example/bad name") is False


# ─── AC-11.8 (R-6.5-h): `{}` means enabled-no-settings ─────────────────────────


class TestEmptyObjectMeansEnabled:
  RAW = {"io.modelcontextprotocol/tasks": {}}

  def test_entry_mapped_to_empty_object_is_advertised(self):
    assert is_extension_advertised(self.RAW, "io.modelcontextprotocol/tasks") is True
    assert get_extension_settings(self.RAW, "io.modelcontextprotocol/tasks") == {}

  def test_empty_object_retained_through_normalization(self):
    assert normalize_extensions_map(self.RAW) == {"io.modelcontextprotocol/tasks": {}}

  def test_empty_object_is_valid_settings(self):
    assert is_extension_settings({}) is True


# ─── AC-11.9 (R-6.5-i): producer map has no null values ────────────────────────


class TestProducerMapNoNull:
  def test_accepts_all_object_values(self):
    map_ = {"com.example/a": {}, "com.example/b": {"setting": 1}}
    assert is_valid_extensions_map(map_) is True

  def test_rejects_none_value(self):
    assert is_valid_extensions_map({"com.example/a": None}) is False

  def test_rejects_non_dict_map(self):
    assert is_valid_extensions_map(None) is False
    assert is_valid_extensions_map([]) is False
    assert is_valid_extensions_map("x") is False


# ─── AC-11.10 (R-6.5-j): null entry malformed → ignored ────────────────────────


class TestNullEntryIgnored:
  RAW = {
    "io.modelcontextprotocol/ui": {"mimeTypes": ["text/html"]},
    "io.modelcontextprotocol/broken": None,
  }

  def test_drops_null_entry_during_normalization(self):
    normalized = normalize_extensions_map(self.RAW)
    assert "io.modelcontextprotocol/broken" not in normalized
    assert normalized == {"io.modelcontextprotocol/ui": {"mimeTypes": ["text/html"]}}

  def test_null_extension_not_advertised(self):
    assert is_extension_advertised(self.RAW, "io.modelcontextprotocol/broken") is False
    assert get_extension_settings(self.RAW, "io.modelcontextprotocol/broken") is None

  def test_ignores_non_object_values_as_malformed(self):
    weird = {"a/b": [], "c/d": 42, "e/f": "x", "g/h": True}
    assert normalize_extensions_map(weird) == {}

  def test_normalize_returns_new_object_without_mutating_input(self):
    raw = {"com.example/a": {}, "com.example/bad": None}
    out = normalize_extensions_map(raw)
    assert out is not raw
    assert "com.example/bad" in raw  # input not mutated


# ─── AC-11.11 (R-6.5-k): unknown settings keys ignored ─────────────────────────


class TestUnknownSettingsKeysIgnored:
  def test_projects_to_known_keys_iterable(self):
    settings = {"mimeTypes": ["text/html"], "somethingElse": True, "another": 1}
    assert pick_known_settings(settings, ["mimeTypes"]) == {"mimeTypes": ["text/html"]}

  def test_accepts_set_of_known_keys(self):
    settings = {"a": 1, "b": 2, "c": 3}
    assert pick_known_settings(settings, {"a", "c"}) == {"a": 1, "c": 3}

  def test_all_unknown_yields_empty(self):
    assert pick_known_settings({"x": 1}, ["mimeTypes"]) == {}


# ─── AC-11.12 (R-6.5-l): active only in the intersection ───────────────────────


class TestActiveOnlyInIntersection:
  def test_not_active_when_only_client_advertises(self):
    client = {"com.example/E": {}}
    server = {}
    assert is_extension_active("com.example/E", client, server) is False
    assert intersect_extensions(client, server) == []

  def test_not_active_when_only_server_advertises(self):
    assert is_extension_active("com.example/E", {}, {"com.example/E": {}}) is False

  def test_active_only_when_both_advertise(self):
    client = {"com.example/E": {}, "com.example/onlyClient": {}}
    server = {"com.example/E": {}, "com.example/onlyServer": {}}
    assert is_extension_active("com.example/E", client, server) is True
    assert intersect_extensions(client, server) == ["com.example/E"]

  def test_intersection_is_sorted(self):
    client = {"com.example/z": {}, "com.example/a": {}, "com.example/m": {}}
    server = {"com.example/a": {}, "com.example/m": {}, "com.example/z": {}}
    assert intersect_extensions(client, server) == [
      "com.example/a",
      "com.example/m",
      "com.example/z",
    ]


# ─── AC-11.13 (R-6.5-m): disabled by default ───────────────────────────────────


class TestDisabledByDefault:
  def test_empty_map_advertises_nothing(self):
    assert normalize_extensions_map({}) == {}
    assert is_extension_advertised({}, "com.example/E") is False

  def test_absent_map_advertises_nothing(self):
    assert normalize_extensions_map(None) == {}
    assert is_extension_advertised(None, "com.example/E") is False

  def test_not_enabled_extension_absent(self):
    advertised = {"com.example/enabled": {}}
    assert is_extension_advertised(advertised, "com.example/enabled") is True
    assert is_extension_advertised(advertised, "com.example/notEnabled") is False


# ─── AC-11.14 (R-6.5-n): one-sided support fallback ────────────────────────────


class TestOneSidedFallback:
  def test_use_extension_when_active(self):
    assert decide_extension_fallback(active=True, mandatory=False) == "use-extension"
    assert decide_extension_fallback(active=True, mandatory=True) == "use-extension"

  def test_fallback_when_not_active_not_mandatory(self):
    assert decide_extension_fallback(active=False, mandatory=False) == "fallback"

  def test_reject_only_when_not_active_and_mandatory(self):
    assert decide_extension_fallback(active=False, mandatory=True) == "reject"

  def test_decision_tied_to_intersection_state(self):
    active = is_extension_active("com.example/E", {"com.example/E": {}}, {})
    assert decide_extension_fallback(active=active, mandatory=False) == "fallback"
    assert decide_extension_fallback(active=active, mandatory=True) == "reject"


# ─── AC-11.15..17 (R-6.6-a..c): tolerate / ignore unknown capability fields ────


class TestToleranceOfUnknownFields:
  def test_normalize_does_not_raise_on_unknown_keys(self):
    raw = {"com.other/unknown": {}, "com.example/known": {"x": 1}}
    assert normalize_extensions_map(raw) == raw

  def test_reports_and_drops_unknown_server_fields(self):
    caps = {"tools": {"listChanged": True}, "futureFeature": {"anything": True}}
    assert unknown_capability_fields(caps, KNOWN_SERVER_CAPABILITY_FIELDS) == ["futureFeature"]
    assert ignore_unknown_capability_fields(caps, KNOWN_SERVER_CAPABILITY_FIELDS) == {
      "tools": {"listChanged": True},
    }

  def test_keeps_recognized_client_fields(self):
    caps = {"elicitation": {"form": {}}, "mystery": 1}
    assert ignore_unknown_capability_fields(caps, KNOWN_CLIENT_CAPABILITY_FIELDS) == {
      "elicitation": {"form": {}},
    }

  def test_unknown_field_non_fatal_view_still_usable(self):
    caps = {"tools": {"listChanged": True}, "futureFeature": {"anything": True}}
    unknown = unknown_capability_fields(caps, KNOWN_SERVER_CAPABILITY_FIELDS)
    assert len(unknown) > 0
    acted = ignore_unknown_capability_fields(caps, KNOWN_SERVER_CAPABILITY_FIELDS)
    assert "tools" in acted


# ─── AC-11.18 (R-6.6-d): unknown extension key ignored, not active ─────────────


class TestUnknownExtensionKeyNotActive:
  def test_one_peer_only_extension_not_in_intersection(self):
    client = {"io.modelcontextprotocol/ui": {}, "com.other/unknown": {}}
    server = {"io.modelcontextprotocol/ui": {}}
    assert intersect_extensions(client, server) == ["io.modelcontextprotocol/ui"]
    assert is_extension_active("com.other/unknown", client, server) is False

  def test_experimental_style_map_drops_unrecognized(self):
    experimental = {"com.other/unknown": {"foo": 1}}
    recognized = set()  # receiver recognizes none of them
    assert ignore_unknown_capability_fields(experimental, recognized) == {}


# ─── AC-11.19 (R-6.6-e): newer settings keys ignored ───────────────────────────


class TestNewerSettingsKeysIgnored:
  def test_older_receiver_drops_unknown_settings(self):
    settings = {"mimeTypes": ["text/html;profile=mcp-app"], "unknownSetting": 42}
    assert pick_known_settings(settings, ["mimeTypes"]) == {
      "mimeTypes": ["text/html;profile=mcp-app"],
    }


# ─── AC-11.20 (R-6.6-f): unknown things are not errors ─────────────────────────


class TestUnknownNotAnError:
  def test_normalize_unknown_extension_no_error(self):
    raw = {"com.other/unknown": {}}
    assert normalize_extensions_map(raw) == raw

  def test_reading_unknown_capability_fields_no_error(self):
    caps = {"unknownA": 1, "unknownB": 2}
    assert unknown_capability_fields(caps, KNOWN_SERVER_CAPABILITY_FIELDS) == [
      "unknownA",
      "unknownB",
    ]

  def test_picking_all_unknown_settings_yields_empty(self):
    assert pick_known_settings({"x": 1}, ["mimeTypes"]) == {}


# ─── AC-11.21 (R-6.6-g): absence of unknown field implies nothing ──────────────


class TestAbsenceImpliesNothing:
  def test_dropping_unknown_leaves_recognized_untouched(self):
    with_unknown = {"tools": {"listChanged": True}, "futureFeature": {"x": True}}
    without_unknown = {"tools": {"listChanged": True}}
    assert ignore_unknown_capability_fields(
      with_unknown, KNOWN_SERVER_CAPABILITY_FIELDS
    ) == ignore_unknown_capability_fields(without_unknown, KNOWN_SERVER_CAPABILITY_FIELDS)

  def test_unrecognized_extension_presence_does_not_change_active_set(self):
    client = {"io.modelcontextprotocol/ui": {}}
    server_with = {"io.modelcontextprotocol/ui": {}, "com.other/unknown": {}}
    server_without = {"io.modelcontextprotocol/ui": {}}
    assert intersect_extensions(client, server_with) == intersect_extensions(
      client, server_without
    )


# ─── AC-11.22 (R-6.7-a): §6.7 worked example ───────────────────────────────────


class TestWorkedExample:
  CLIENT_EXT = {
    "io.modelcontextprotocol/ui": {"mimeTypes": ["text/html;profile=mcp-app"]},
  }
  SERVER_EXT = {
    "io.modelcontextprotocol/tasks": {},
  }

  def test_client_ui_not_active_unless_server_advertises(self):
    assert is_extension_active(
      "io.modelcontextprotocol/ui", self.CLIENT_EXT, self.SERVER_EXT
    ) is False
    assert decide_extension_fallback(active=False, mandatory=False) == "fallback"

  def test_server_tasks_not_active_unless_client_advertises(self):
    assert is_extension_active(
      "io.modelcontextprotocol/tasks", self.CLIENT_EXT, self.SERVER_EXT
    ) is False

  def test_intersection_empty_for_disjoint_sides(self):
    assert intersect_extensions(self.CLIENT_EXT, self.SERVER_EXT) == []

  def test_ui_becomes_active_once_server_advertises(self):
    server_also_ui = {**self.SERVER_EXT, "io.modelcontextprotocol/ui": {}}
    assert is_extension_active(
      "io.modelcontextprotocol/ui", self.CLIENT_EXT, server_also_ui
    ) is True
    assert intersect_extensions(self.CLIENT_EXT, server_also_ui) == [
      "io.modelcontextprotocol/ui",
    ]

  def test_forward_compat_example_null_unknown_key_unknown_setting(self):
    received = {
      "tools": {"listChanged": True},
      "futureFeature": {"anything": True},
      "extensions": {
        "io.modelcontextprotocol/ui": {
          "mimeTypes": ["text/html;profile=mcp-app"],
          "unknownSetting": 42,
        },
        "com.other/unknown": {},
        "io.modelcontextprotocol/broken": None,
      },
    }

    # Unknown capability field is ignored, message not rejected.
    assert unknown_capability_fields(received, KNOWN_SERVER_CAPABILITY_FIELDS) == ["futureFeature"]

    # null entry dropped; ui retained; com.other/unknown retained for intersection.
    normalized = normalize_extensions_map(received["extensions"])
    assert sorted(normalized.keys()) == [
      "com.other/unknown",
      "io.modelcontextprotocol/ui",
    ]

    # Unknown setting on the recognized extension is ignored by the extension.
    ui = get_extension_settings(received["extensions"], "io.modelcontextprotocol/ui")
    assert ui is not None
    assert pick_known_settings(ui, ["mimeTypes"]) == {
      "mimeTypes": ["text/html;profile=mcp-app"],
    }
