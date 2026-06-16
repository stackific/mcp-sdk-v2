"""Tests for server-to-client streaming & subscriptions — filters, gating, lifecycle (§10).

Mirrors ``ts-sdk/src/__tests__/protocol/streaming.test.ts`` (AC-16.1 … AC-16.23) and
``streaming-teardown.test.ts`` plus Python-side edge cases.
"""

import pytest

from mcp.protocol.streaming import (
  CHANGE_NOTIFICATION_METHODS,
  PROMPTS_LIST_CHANGED_METHOD,
  REQUEST_SCOPED_NOTIFICATION_METHODS,
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
  SUBSCRIPTION_ID_META_KEY,
  SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  SUBSCRIPTIONS_LISTEN_METHOD,
  TOOLS_LIST_CHANGED_METHOD,
  Subscription,
  SubscriptionRegistry,
  classify_notification_stream,
  compute_acknowledged_filter,
  declined_filter_kinds,
  is_absolute_uri,
  is_change_notification_method,
  is_empty_subscription_filter,
  is_request_scoped_notification_method,
  is_valid_resource_updated_notification_params,
  is_valid_subscription_filter,
  is_valid_subscription_meta,
  is_valid_subscriptions_acknowledged_notification,
  is_valid_subscriptions_acknowledged_notification_params,
  is_valid_subscriptions_listen_request,
  is_valid_subscriptions_listen_request_params,
  is_violation_on_request_stream,
  is_violation_on_subscription_stream,
  may_deliver_resource_update,
  may_emit_change_notification,
  read_subscription_id,
  subscription_id_from_request_id,
  uri_covered_by_subscription,
)

TOOLS_LIST_CHANGED = "notifications/tools/list_changed"
PROMPTS_LIST_CHANGED = "notifications/prompts/list_changed"
RESOURCES_LIST_CHANGED = "notifications/resources/list_changed"
RESOURCES_UPDATED = "notifications/resources/updated"

# A valid per-request `_meta` (the three required reserved keys), reused below.
REQUEST_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": {"name": "ExampleClient", "version": "1.0.0"},
  "io.modelcontextprotocol/clientCapabilities": {},
}

CONFIG_URI = "file:///project/config.json"

# Server caps declaring all relevant sub-flags.
FULL_CAPS = {
  "tools": {"listChanged": True},
  "prompts": {"listChanged": True},
  "resources": {"subscribe": True, "listChanged": True},
}


class TestSubscriptionIdFromRequestId:
  def test_int(self):
    assert subscription_id_from_request_id(42) == "42"

  def test_str(self):
    assert subscription_id_from_request_id("abc") == "abc"


class TestReadSubscriptionId:
  def test_present(self):
    params = {"_meta": {SUBSCRIPTION_ID_META_KEY: "sub-1"}}
    assert read_subscription_id(params) == "sub-1"

  def test_absent(self):
    assert read_subscription_id({"_meta": {}}) is None
    assert read_subscription_id({}) is None

  def test_non_dict(self):
    assert read_subscription_id(None) is None
    assert read_subscription_id("nope") is None
    assert read_subscription_id({"_meta": "notdict"}) is None


class TestComputeAcknowledgedFilter:
  def test_tools_list_changed_honored_when_declared(self):
    caps = {"tools": {"listChanged": True}}
    honored = compute_acknowledged_filter({"toolsListChanged": True}, caps)
    assert honored == {"toolsListChanged": True}

  def test_tools_list_changed_dropped_when_not_declared(self):
    caps = {"tools": {}}
    honored = compute_acknowledged_filter({"toolsListChanged": True}, caps)
    assert "toolsListChanged" not in honored

  def test_resource_subscriptions_honored_only_with_subscribe(self):
    caps = {"resources": {"subscribe": True}}
    honored = compute_acknowledged_filter({"resourceSubscriptions": ["file:///a"]}, caps)
    assert honored["resourceSubscriptions"] == ["file:///a"]

  def test_resource_subscriptions_dropped_when_only_list_changed(self):
    # listChanged is NOT subscribe; resourceSubscriptions must be dropped.
    caps = {"resources": {"listChanged": True}}
    honored = compute_acknowledged_filter({"resourceSubscriptions": ["file:///a"]}, caps)
    assert "resourceSubscriptions" not in honored

  def test_task_ids_honored_only_when_active(self):
    honored_off = compute_acknowledged_filter({"taskIds": ["t1"]}, {}, tasks_active=False)
    assert "taskIds" not in honored_off
    honored_on = compute_acknowledged_filter({"taskIds": ["t1"]}, {}, tasks_active=True)
    assert honored_on["taskIds"] == ["t1"]


class TestMayEmitChangeNotification:
  def test_tools_list_changed_gated(self):
    assert may_emit_change_notification(TOOLS_LIST_CHANGED, {"toolsListChanged": True})
    assert not may_emit_change_notification(TOOLS_LIST_CHANGED, {})

  def test_prompts_list_changed_gated(self):
    assert may_emit_change_notification(PROMPTS_LIST_CHANGED, {"promptsListChanged": True})
    assert not may_emit_change_notification(PROMPTS_LIST_CHANGED, {})

  def test_resources_list_changed_gated(self):
    assert may_emit_change_notification(RESOURCES_LIST_CHANGED, {"resourcesListChanged": True})
    assert not may_emit_change_notification(RESOURCES_LIST_CHANGED, {})

  def test_resources_updated_exact_match(self):
    ack = {"resourceSubscriptions": ["file:///dir/a.txt"]}
    assert may_emit_change_notification(RESOURCES_UPDATED, ack, "file:///dir/a.txt")

  def test_resources_updated_sub_resource_path_prefix(self):
    ack = {"resourceSubscriptions": ["file:///dir"]}
    assert may_emit_change_notification(RESOURCES_UPDATED, ack, "file:///dir/a.txt")

  def test_resources_updated_not_a_sibling_prefix(self):
    ack = {"resourceSubscriptions": ["file:///dir"]}
    assert not may_emit_change_notification(RESOURCES_UPDATED, ack, "file:///directory")

  def test_resources_updated_no_subscriptions(self):
    assert not may_emit_change_notification(RESOURCES_UPDATED, {}, "file:///dir/a.txt")
    assert not may_emit_change_notification(RESOURCES_UPDATED, {"resourceSubscriptions": ["file:///dir"]}, None)


class TestSubscription:
  def test_acknowledge_returns_filter_and_meta_and_activates(self):
    sub = Subscription(7, {"toolsListChanged": True}, {"tools": {"listChanged": True}})
    assert sub.state == "opening"
    ack = sub.acknowledge()
    assert ack["notifications"] == {"toolsListChanged": True}
    assert ack["_meta"] == {SUBSCRIPTION_ID_META_KEY: "7"}
    assert sub.state == "active"

  def test_acknowledge_twice_raises(self):
    sub = Subscription(1, {}, {})
    sub.acknowledge()
    with pytest.raises(RuntimeError):
      sub.acknowledge()

  def test_may_emit_false_before_acknowledge(self):
    sub = Subscription(1, {"toolsListChanged": True}, {"tools": {"listChanged": True}})
    assert not sub.may_emit(TOOLS_LIST_CHANGED)

  def test_may_emit_after_acknowledge_then_false_after_close(self):
    sub = Subscription(1, {"toolsListChanged": True}, {"tools": {"listChanged": True}})
    sub.acknowledge()
    assert sub.may_emit(TOOLS_LIST_CHANGED)
    sub.close("teardown")
    assert not sub.may_emit(TOOLS_LIST_CHANGED)

  def test_close_idempotent_first_reason_wins(self):
    sub = Subscription(1, {}, {})
    sub.close("first")
    sub.close("second")
    assert sub.is_closed
    assert sub.close_reason == "first"


# ─── AC-16.1 — subscriptions/listen request envelope ─────────────────────────


class TestSubscriptionsListenRequest:
  def test_well_formed_request_accepted(self):
    req = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": SUBSCRIPTIONS_LISTEN_METHOD,
      "params": {"_meta": REQUEST_META, "notifications": {"toolsListChanged": True}},
    }
    assert is_valid_subscriptions_listen_request(req)

  def test_rejects_missing_params(self):
    assert not is_valid_subscriptions_listen_request(
      {"jsonrpc": "2.0", "id": 1, "method": SUBSCRIPTIONS_LISTEN_METHOD}
    )

  def test_rejects_notification_shape_no_id(self):
    notif = {
      "jsonrpc": "2.0",
      "method": SUBSCRIPTIONS_LISTEN_METHOD,
      "params": {"_meta": REQUEST_META, "notifications": {}},
    }
    assert not is_valid_subscriptions_listen_request(notif)

  def test_rejects_wrong_method(self):
    assert not is_valid_subscriptions_listen_request(
      {"jsonrpc": "2.0", "id": 1, "method": "other", "params": {"_meta": REQUEST_META, "notifications": {}}}
    )


# ─── AC-16.2 — notifications required; _meta required on params ───────────────


class TestSubscriptionsListenRequestParams:
  def test_requires_notifications(self):
    assert not is_valid_subscriptions_listen_request_params({"_meta": REQUEST_META})

  def test_accepts_notifications_plus_meta(self):
    assert is_valid_subscriptions_listen_request_params(
      {"_meta": REQUEST_META, "notifications": {"toolsListChanged": True}}
    )

  def test_requires_meta(self):
    assert not is_valid_subscriptions_listen_request_params({"notifications": {}})

  def test_no_implicit_subscriptions_empty_filter_requests_nothing(self):
    params = {"_meta": REQUEST_META, "notifications": {}}
    assert is_valid_subscriptions_listen_request_params(params)
    assert is_empty_subscription_filter(params["notifications"])


# ─── AC-16.3 — SubscriptionFilter: all fields optional ───────────────────────


class TestSubscriptionFilter:
  def test_empty_filter_valid(self):
    assert is_valid_subscription_filter({})

  def test_three_booleans_and_array(self):
    f = {
      "toolsListChanged": True,
      "promptsListChanged": False,
      "resourcesListChanged": True,
      "resourceSubscriptions": [CONFIG_URI],
    }
    assert is_valid_subscription_filter(f)

  def test_rejects_non_boolean_field(self):
    assert not is_valid_subscription_filter({"toolsListChanged": "yes"})

  def test_rejects_relative_uri_entry(self):
    assert not is_valid_subscription_filter({"resourceSubscriptions": [CONFIG_URI, "not-a-uri"]})

  def test_task_ids_must_be_strings(self):
    assert is_valid_subscription_filter({"taskIds": ["t1", "t2"]})
    assert not is_valid_subscription_filter({"taskIds": [1, 2]})

  def test_is_empty_filter_variants(self):
    assert is_empty_subscription_filter({})
    assert is_empty_subscription_filter({"toolsListChanged": False})
    assert is_empty_subscription_filter({"resourceSubscriptions": []})
    assert not is_empty_subscription_filter({"toolsListChanged": True})
    assert not is_empty_subscription_filter({"resourceSubscriptions": [CONFIG_URI]})

  def test_no_kinds_filter_yields_acknowledgement_only_stream(self):
    sub = Subscription(7, {}, FULL_CAPS)
    ack = sub.acknowledge()
    assert ack["_meta"][SUBSCRIPTION_ID_META_KEY] == "7"
    assert is_empty_subscription_filter(ack["notifications"])
    assert sub.state == "active"


# ─── AC-16.4 — absolute-URI validation ───────────────────────────────────────


class TestIsAbsoluteUri:
  def test_accepts_absolute(self):
    assert is_absolute_uri(CONFIG_URI)
    assert is_absolute_uri("https://host/path")

  def test_rejects_relative_and_non_uri(self):
    assert not is_absolute_uri("/project/config.json")
    assert not is_absolute_uri("config.json")
    assert not is_absolute_uri("")
    assert not is_absolute_uri(42)

  def test_rejects_scheme_with_empty_hier_part(self):
    # A bare "scheme:" with nothing after it is not an absolute URI here.
    assert not is_absolute_uri("mailto:")


# ─── AC-16.7 — honored subset omits unsupported kinds; taskIds gating ─────────


class TestComputeAcknowledgedFilterParity:
  def test_omits_unsupported_kind(self):
    honored = compute_acknowledged_filter(
      {"toolsListChanged": True, "promptsListChanged": True}, {"tools": {"listChanged": True}}
    )
    assert honored.get("toolsListChanged") is True
    assert "promptsListChanged" not in honored

  def test_resource_subscriptions_only_with_subscribe(self):
    requested = {"resourceSubscriptions": [CONFIG_URI]}
    assert "resourceSubscriptions" not in compute_acknowledged_filter(requested, {})
    assert compute_acknowledged_filter(requested, {"resources": {"subscribe": True}})[
      "resourceSubscriptions"
    ] == [CONFIG_URI]

  def test_task_ids_only_when_active(self):
    requested = {"taskIds": ["t1", "t2"]}
    assert "taskIds" not in compute_acknowledged_filter(requested, FULL_CAPS)
    assert "taskIds" not in compute_acknowledged_filter(requested, {"tasks": {}})
    assert compute_acknowledged_filter(requested, FULL_CAPS, tasks_active=True)["taskIds"] == ["t1", "t2"]
    assert Subscription(1, requested, {}, tasks_active=True).acknowledged_filter["taskIds"] == ["t1", "t2"]
    assert "taskIds" not in Subscription(1, requested, {"tasks": {}}).acknowledged_filter


# ─── AC-16.8 — declined-kind reporting ───────────────────────────────────────


class TestDeclinedFilterKinds:
  def test_reports_declined_fields_and_uris(self):
    requested = {
      "toolsListChanged": True,
      "promptsListChanged": True,
      "resourceSubscriptions": [CONFIG_URI, "file:///x.txt"],
    }
    acknowledged = {"toolsListChanged": True, "resourceSubscriptions": [CONFIG_URI]}
    declined = declined_filter_kinds(requested, acknowledged)
    assert "promptsListChanged" in declined.fields
    assert "toolsListChanged" not in declined.fields
    assert declined.uris == ["file:///x.txt"]

  def test_nothing_declined_when_all_honored(self):
    f = {"toolsListChanged": True}
    declined = declined_filter_kinds(f, f)
    assert declined.fields == [] and declined.uris == []


# ─── AC-16.9 — subscriptionId meta key ───────────────────────────────────────


class TestSubscriptionMeta:
  def test_id_serialization_and_key(self):
    assert subscription_id_from_request_id(1) == "1"
    assert subscription_id_from_request_id("abc") == "abc"
    assert SUBSCRIPTION_ID_META_KEY == "io.modelcontextprotocol/subscriptionId"

  def test_meta_schema_requires_string_value(self):
    assert is_valid_subscription_meta({SUBSCRIPTION_ID_META_KEY: "1"})
    assert not is_valid_subscription_meta({SUBSCRIPTION_ID_META_KEY: 1})
    assert not is_valid_subscription_meta({})

  def test_key_is_case_sensitive(self):
    assert read_subscription_id({"_meta": {"io.modelcontextprotocol/subscriptionid": "1"}}) is None
    assert read_subscription_id({"_meta": {SUBSCRIPTION_ID_META_KEY: "1"}}) == "1"

  def test_ack_meta_carries_id_verbatim(self):
    sub = Subscription(1, {"toolsListChanged": True}, FULL_CAPS)
    assert sub.acknowledge()["_meta"][SUBSCRIPTION_ID_META_KEY] == "1"


# ─── AC-16.10/.11/.23 — registry routing & multiplexing ──────────────────────


class TestSubscriptionRegistry:
  def test_routes_each_notification_by_id(self):
    registry = SubscriptionRegistry()
    a = Subscription(1, {"toolsListChanged": True}, FULL_CAPS)
    b = Subscription("two", {"resourcesListChanged": True}, FULL_CAPS)
    registry.add(a)
    registry.add(b)
    assert registry.route({"_meta": {SUBSCRIPTION_ID_META_KEY: "1"}}) is a
    assert registry.route({"_meta": {SUBSCRIPTION_ID_META_KEY: "two"}}) is b

  def test_route_unknown_or_absent_id_is_none(self):
    registry = SubscriptionRegistry()
    registry.add(Subscription(1, {}, FULL_CAPS))
    assert registry.route({"_meta": {}}) is None
    assert registry.route({"_meta": {SUBSCRIPTION_ID_META_KEY: "99"}}) is None

  def test_remove_leaves_no_retained_state(self):
    registry = SubscriptionRegistry()
    registry.add(Subscription(1, {"toolsListChanged": True}, FULL_CAPS))
    assert registry.size == 1
    assert registry.remove("1", "transport-close")
    assert registry.size == 0
    assert registry.get("1") is None

  def test_remove_returns_false_when_absent(self):
    assert not SubscriptionRegistry().remove("nope", "transport-close")

  def test_re_establish_is_new_subscription_with_new_id(self):
    registry = SubscriptionRegistry()
    registry.add(Subscription(1, {"toolsListChanged": True}, FULL_CAPS))
    registry.remove("1", "transport-close")
    registry.add(Subscription(2, {"toolsListChanged": True}, FULL_CAPS))
    assert registry.active_ids == ["2"]

  def test_holds_independent_subscriptions(self):
    registry = SubscriptionRegistry()
    a = Subscription(1, {"toolsListChanged": True}, FULL_CAPS)
    b = Subscription(2, {"resourceSubscriptions": [CONFIG_URI]}, FULL_CAPS)
    registry.add(a)
    registry.add(b)
    assert registry.size == 2
    assert sorted(registry.active_ids) == ["1", "2"]
    registry.remove("1", "client-cancel")
    assert a.is_closed and not b.is_closed
    assert registry.get("2") is b

  def test_rejects_duplicate_active_id(self):
    registry = SubscriptionRegistry()
    registry.add(Subscription(1, {}, FULL_CAPS))
    with pytest.raises(ValueError):
      registry.add(Subscription(1, {}, FULL_CAPS))

  def test_meta_fragment_present_on_http(self):
    sub = Subscription(5, {"toolsListChanged": True}, FULL_CAPS)
    sub.acknowledge()
    meta = sub.meta_fragment()
    assert meta[SUBSCRIPTION_ID_META_KEY] == "5"
    assert read_subscription_id({"_meta": meta}) == "5"


# ─── AC-16.6/.12 — acknowledgement & change-notification validation ──────────


class TestAcknowledgedNotificationValidation:
  def test_acknowledged_notification_params_valid(self):
    params = {"notifications": {"toolsListChanged": True}, "_meta": {SUBSCRIPTION_ID_META_KEY: "1"}}
    assert is_valid_subscriptions_acknowledged_notification_params(params)

  def test_acknowledged_notification_envelope_valid(self):
    ack = {
      "jsonrpc": "2.0",
      "method": SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
      "params": {"notifications": {"toolsListChanged": True}, "_meta": {SUBSCRIPTION_ID_META_KEY: "1"}},
    }
    assert SUBSCRIPTIONS_ACKNOWLEDGED_METHOD == "notifications/subscriptions/acknowledged"
    assert is_valid_subscriptions_acknowledged_notification(ack)

  def test_acknowledged_params_requires_meta_id(self):
    assert not is_valid_subscriptions_acknowledged_notification_params(
      {"notifications": {}, "_meta": {}}
    )

  def test_four_change_kinds_exactly(self):
    assert CHANGE_NOTIFICATION_METHODS == (
      "notifications/tools/list_changed",
      "notifications/prompts/list_changed",
      "notifications/resources/list_changed",
      "notifications/resources/updated",
    )
    assert len(CHANGE_NOTIFICATION_METHODS) == 4
    for m in CHANGE_NOTIFICATION_METHODS:
      assert is_change_notification_method(m)
    assert not is_change_notification_method("notifications/progress")


# ─── AC-16.14 — resources/updated validation & URI coverage ──────────────────


class TestResourceUpdatedNotification:
  def test_requires_absolute_uri(self):
    assert is_valid_resource_updated_notification_params(
      {"uri": CONFIG_URI, "_meta": {SUBSCRIPTION_ID_META_KEY: "1"}}
    )
    assert not is_valid_resource_updated_notification_params(
      {"_meta": {SUBSCRIPTION_ID_META_KEY: "1"}}
    )
    assert not is_valid_resource_updated_notification_params(
      {"uri": "/relative", "_meta": {SUBSCRIPTION_ID_META_KEY: "1"}}
    )

  def test_uri_coverage_sub_resource(self):
    assert uri_covered_by_subscription("file:///dir/file.txt", "file:///dir")
    assert uri_covered_by_subscription("file:///dir/sub/f.txt", "file:///dir/")
    assert not uri_covered_by_subscription("file:///directory/f", "file:///dir")
    assert not uri_covered_by_subscription("https://a/p", "https://b/p")

  def test_may_deliver_resource_update(self):
    assert may_deliver_resource_update(CONFIG_URI, [CONFIG_URI])
    assert not may_deliver_resource_update("file:///other.txt", [CONFIG_URI])


# ─── AC-16.16/.17 — stream-boundary classification & violations ──────────────


class TestStreamBoundary:
  def test_request_scoped_methods(self):
    assert REQUEST_SCOPED_NOTIFICATION_METHODS == (
      "notifications/progress",
      "notifications/message",
    )
    for m in REQUEST_SCOPED_NOTIFICATION_METHODS:
      assert is_request_scoped_notification_method(m)
      assert classify_notification_stream(m) == "request-scoped"

  def test_change_kinds_classified_as_subscription(self):
    for m in CHANGE_NOTIFICATION_METHODS:
      assert classify_notification_stream(m) == "subscription"

  def test_unrelated_method_is_neither(self):
    assert classify_notification_stream("notifications/initialized") == "neither"

  def test_request_scoped_on_subscription_stream_is_violation(self):
    assert is_violation_on_subscription_stream("notifications/progress")
    assert is_violation_on_subscription_stream("notifications/message")
    assert not is_violation_on_subscription_stream(TOOLS_LIST_CHANGED_METHOD)

  def test_change_kind_on_request_stream_is_violation(self):
    assert is_violation_on_request_stream(TOOLS_LIST_CHANGED_METHOD)
    assert is_violation_on_request_stream(RESOURCES_UPDATED_METHOD)
    assert not is_violation_on_request_stream("notifications/progress")


# ─── AC-16.15 — emit only if requested AND reflected in acknowledged filter ──


class TestEmitGating:
  def test_not_emitted_when_capability_undeclared(self):
    ack = compute_acknowledged_filter({"toolsListChanged": True}, {})
    assert "toolsListChanged" not in ack
    assert not may_emit_change_notification(TOOLS_LIST_CHANGED_METHOD, ack)

  def test_emitted_when_requested_and_reflected(self):
    ack = compute_acknowledged_filter({"toolsListChanged": True}, FULL_CAPS)
    assert ack["toolsListChanged"] is True
    assert may_emit_change_notification(TOOLS_LIST_CHANGED_METHOD, ack)

  def test_subscription_may_emit_gates_on_active_and_filter(self):
    sub = Subscription(1, {"toolsListChanged": True}, {})
    sub.acknowledge()
    assert not sub.may_emit(TOOLS_LIST_CHANGED_METHOD)


# ─── AC-16.18/.19/.20 — lifecycle close reasons ──────────────────────────────


class TestLifecycleCloseReasons:
  def test_client_cancel(self):
    sub = Subscription(1, {"toolsListChanged": True}, FULL_CAPS)
    sub.acknowledge()
    sub.close("client-cancel")
    assert sub.state == "closed" and sub.close_reason == "client-cancel" and sub.is_closed

  def test_server_teardown(self):
    sub = Subscription(1, {}, FULL_CAPS)
    sub.acknowledge()
    sub.close("server-teardown")
    assert sub.close_reason == "server-teardown"

  def test_transport_close_idempotent(self):
    sub = Subscription(1, {}, FULL_CAPS)
    sub.close("transport-close")
    sub.close("client-cancel")
    assert sub.close_reason == "transport-close"


# ─── streaming-teardown — teardown_notification (R-10.7-b, TV-16.14) ─────────


class TestTeardownNotification:
  def test_builds_cancelled_referencing_numeric_listen_id(self):
    sub = Subscription(1, {})
    sub.acknowledge()
    sub.close("server-teardown")
    signal = sub.teardown_notification()
    assert signal["method"] == "notifications/cancelled"
    assert signal["params"]["requestId"] == 1
    assert isinstance(signal["params"]["reason"], str)

  def test_preserves_string_id_and_custom_reason(self):
    sub = Subscription("listen-42", {})
    signal = sub.teardown_notification("server shutting down")
    assert signal["params"]["requestId"] == "listen-42"
    assert signal["params"]["reason"] == "server shutting down"


# ─── AC-16.13 — list-changed kinds map to the list a client SHOULD re-fetch ───


class TestListChangedKinds:
  def test_each_list_changed_method_names_its_list(self):
    assert TOOLS_LIST_CHANGED_METHOD == "notifications/tools/list_changed"
    assert PROMPTS_LIST_CHANGED_METHOD == "notifications/prompts/list_changed"
    assert RESOURCES_LIST_CHANGED_METHOD == "notifications/resources/list_changed"
    # The three list-changed kinds; resources/updated is the fourth, non-list kind.
    list_changed = [m for m in CHANGE_NOTIFICATION_METHODS if m.endswith("list_changed")]
    assert list_changed == [
      TOOLS_LIST_CHANGED_METHOD,
      PROMPTS_LIST_CHANGED_METHOD,
      RESOURCES_LIST_CHANGED_METHOD,
    ]


# ─── AC-16.22 — no resumption surface; re-establish via new listen with new id ─


class TestNoResumptionSurface:
  def test_new_listen_yields_a_new_subscription_identifier(self):
    first = Subscription(1, {"toolsListChanged": True}, FULL_CAPS)
    second = Subscription(2, {"toolsListChanged": True}, FULL_CAPS)
    assert first.subscription_id == "1"
    assert second.subscription_id == "2"
    assert first.subscription_id != second.subscription_id

  def test_sole_entry_point_is_the_listen_method(self):
    # There is no GET endpoint / Last-Event-ID symbol — only the request method.
    assert SUBSCRIPTIONS_LISTEN_METHOD == "subscriptions/listen"


# ─── AC-16.12 — change-notification envelope carries _meta subId, no id ───────


class TestChangeNotificationEnvelope:
  def test_change_kind_notification_has_no_id_and_carries_subscription_id(self):
    sub = Subscription(1, {"toolsListChanged": True}, FULL_CAPS)
    sub.acknowledge()
    notif = {
      "jsonrpc": "2.0",
      "method": TOOLS_LIST_CHANGED_METHOD,
      "params": {"_meta": sub.meta_fragment()},
    }
    assert "id" not in notif
    assert read_subscription_id(notif["params"]) == "1"


# ─── taskIds filter validation & gating edge cases (§25.10) ───────────────────


class TestTaskIdsFilter:
  def test_listen_request_accepts_task_ids_filter(self):
    req = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": SUBSCRIPTIONS_LISTEN_METHOD,
      "params": {"_meta": REQUEST_META, "notifications": {"taskIds": ["t1", "t2"]}},
    }
    assert is_valid_subscriptions_listen_request(req)

  def test_task_ids_emit_gated_on_active_acknowledgement(self):
    # Honored only when the Tasks extension is active for the request.
    ack = compute_acknowledged_filter({"taskIds": ["t1"]}, {}, tasks_active=True)
    assert may_emit_change_notification("notifications/tasks", ack, "t1")
    assert not may_emit_change_notification("notifications/tasks", ack, "t-unknown")
    assert not may_emit_change_notification("notifications/tasks", ack, None)

  def test_task_ids_not_emittable_when_not_acknowledged(self):
    ack = compute_acknowledged_filter({"taskIds": ["t1"]}, {}, tasks_active=False)
    assert not may_emit_change_notification("notifications/tasks", ack, "t1")
