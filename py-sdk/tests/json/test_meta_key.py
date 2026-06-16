"""Tests for ``_meta`` key naming + W3C trace-context validation (§2.6.2)."""

from mcp.json.meta_key import (
  is_reserved_meta_key_prefix,
  is_valid_baggage,
  is_valid_meta_key,
  is_valid_meta_key_name,
  is_valid_meta_key_prefix,
  is_valid_trace_context_value,
  is_valid_traceparent,
  is_valid_tracestate,
  parse_meta_key,
)


class TestPrefix:
  def test_valid_reverse_dns(self):
    assert is_valid_meta_key_prefix("com.example/")
    assert is_valid_meta_key_prefix("a/")

  def test_must_end_with_slash(self):
    assert not is_valid_meta_key_prefix("com.example")

  def test_empty_body_rejected(self):
    assert not is_valid_meta_key_prefix("/")

  def test_label_rules(self):
    assert not is_valid_meta_key_prefix("1com/")  # must start with a letter
    assert not is_valid_meta_key_prefix("com-/")  # must end alphanumeric
    assert is_valid_meta_key_prefix("c-o-m/")

  def test_reserved_second_label(self):
    assert is_reserved_meta_key_prefix("com.mcp/")
    assert is_reserved_meta_key_prefix("io.modelcontextprotocol/")
    assert not is_reserved_meta_key_prefix("com.example/")
    assert not is_reserved_meta_key_prefix("mcp/")  # mcp as the FIRST label is not reserved


class TestName:
  def test_empty_name_is_valid(self):
    assert is_valid_meta_key_name("")

  def test_boundaries_alphanumeric(self):
    assert is_valid_meta_key_name("a")
    assert is_valid_meta_key_name("a1")
    assert is_valid_meta_key_name("a.b-c_d9")
    assert not is_valid_meta_key_name("-x")
    assert not is_valid_meta_key_name("x-")
    assert not is_valid_meta_key_name(".x")


class TestParse:
  def test_with_prefix(self):
    assert parse_meta_key("com.example/foo") == ("com.example/", "foo")

  def test_without_prefix(self):
    assert parse_meta_key("foo") == (None, "foo")

  def test_prefix_only(self):
    assert parse_meta_key("com.example/") == ("com.example/", "")


class TestIsValidMetaKey:
  def test_plain_name(self):
    assert is_valid_meta_key("myKey")

  def test_prefixed(self):
    assert is_valid_meta_key("com.example/my-key")

  def test_reserved_prefix_rejected(self):
    assert not is_valid_meta_key("com.mcp/foo")

  def test_reserved_bare_keys_allowed(self):
    assert is_valid_meta_key("traceparent")
    assert is_valid_meta_key("tracestate")
    assert is_valid_meta_key("baggage")

  def test_invalid_prefix_rejected(self):
    assert not is_valid_meta_key("/foo")


class TestTraceparent:
  def test_valid(self):
    assert is_valid_traceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")

  def test_invalid(self):
    assert not is_valid_traceparent("00-tooshort-00f067aa0ba902b7-01")
    assert not is_valid_traceparent("")


class TestTracestate:
  def test_simple_and_multitenant_keys(self):
    assert is_valid_tracestate("rojo=00f067aa0ba902b7")
    assert is_valid_tracestate("congo=t61rcWkgMzE,rojo=00f067aa0ba902b7")
    assert is_valid_tracestate("fw529a3039@dt=foo")

  def test_rejects_empty_and_bad(self):
    assert not is_valid_tracestate("")
    assert not is_valid_tracestate("=novalue")

  def test_member_cap(self):
    too_many = ",".join(f"k{i}=v" for i in range(33))
    assert not is_valid_tracestate(too_many)


class TestBaggage:
  def test_valid(self):
    assert is_valid_baggage("userId=alice")
    assert is_valid_baggage("key1=value1,key2=value2")
    assert is_valid_baggage("key1=value1;property1;property2=pvalue")

  def test_invalid(self):
    assert not is_valid_baggage("")
    assert not is_valid_baggage("=novalue")


class TestTraceContextValue:
  def test_accepts_either_grammar(self):
    assert is_valid_trace_context_value("rojo=00f067aa0ba902b7")
    assert is_valid_trace_context_value("userId=alice")
