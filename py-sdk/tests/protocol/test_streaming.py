"""Tests for server-to-client streaming & subscriptions — filters, gating, lifecycle (§10)."""

import pytest

from mcp.protocol.streaming import (
  SUBSCRIPTION_ID_META_KEY,
  Subscription,
  compute_acknowledged_filter,
  may_emit_change_notification,
  read_subscription_id,
  subscription_id_from_request_id,
)

TOOLS_LIST_CHANGED = "notifications/tools/list_changed"
PROMPTS_LIST_CHANGED = "notifications/prompts/list_changed"
RESOURCES_LIST_CHANGED = "notifications/resources/list_changed"
RESOURCES_UPDATED = "notifications/resources/updated"


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
