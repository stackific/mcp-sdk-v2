using Stackific.Mcp.Json;

namespace Stackific.Mcp.Tests.Json;

/// <summary>
/// The reserved <c>_meta</c> key constants and the structural naming rules of §4.2
/// (Appendix C): <see cref="MetaKeys.IsValidKey"/> for well-formedness and
/// <see cref="MetaKeys.IsReservedPrefix"/> for protocol-prefix ownership.
/// </summary>
public sealed class MetaKeysTests
{
  // --- Reserved key constants equal their literal wire strings. ---

  [Theory]
  [InlineData(MetaKeys.CanonicalPrefix, "io.modelcontextprotocol/")]
  [InlineData(MetaKeys.ProtocolVersion, "io.modelcontextprotocol/protocolVersion")]
  [InlineData(MetaKeys.ClientInfo, "io.modelcontextprotocol/clientInfo")]
  [InlineData(MetaKeys.ClientCapabilities, "io.modelcontextprotocol/clientCapabilities")]
  [InlineData(MetaKeys.LogLevel, "io.modelcontextprotocol/logLevel")]
  [InlineData(MetaKeys.SubscriptionId, "io.modelcontextprotocol/subscriptionId")]
  [InlineData(MetaKeys.ProgressToken, "progressToken")]
  [InlineData(MetaKeys.TraceParent, "traceparent")]
  [InlineData(MetaKeys.TraceState, "tracestate")]
  [InlineData(MetaKeys.Baggage, "baggage")]
  [InlineData(MetaKeys.TasksExtension, "io.modelcontextprotocol/tasks")]
  [InlineData(MetaKeys.UiExtension, "io.modelcontextprotocol/ui")]
  public void Reserved_key_constants_have_their_literal_values(string actual, string expected)
  {
    Assert.Equal(expected, actual);
  }

  // --- IsValidKey: well-formed keys (§4.2). ---

  [Theory]
  // Third-party reverse-DNS prefixes.
  [InlineData("com.example/requestTag")]
  [InlineData("com.example/tag")]
  [InlineData("org.acme.tools/widget")]
  // The three reserved bare trace-context keys (progressToken is NOT a meta-key trace key here).
  [InlineData("traceparent")]
  [InlineData("tracestate")]
  [InlineData("baggage")]
  // Single-label prefix.
  [InlineData("a/name")]
  [InlineData("x/y")]
  [InlineData("vendor/key")]
  // Multi-label prefix.
  [InlineData("a.b.c/name")]
  // A non-reserved prefix that merely contains "modelcontextprotocol"/"mcp" beyond the 2nd label.
  [InlineData("com.example.mcp/key")]
  [InlineData("com.example.modelcontextprotocol/key")]
  // Names with permitted interior characters (hyphen, underscore, dot).
  [InlineData("com.example/req-tag")]
  [InlineData("com.example/req_tag")]
  [InlineData("com.example/req.tag")]
  [InlineData("com.example/a")]
  // Bare names (no prefix) that are themselves well-formed get accepted by the name rule.
  [InlineData("name-only")]
  [InlineData("a")]
  [InlineData("A1")]
  [InlineData("snake_case")]
  [InlineData("progressToken")] // a well-formed bare name (not a trace-context exception)
  // A valid (non-reserved) prefix with an empty name is accepted (name is optional after the slash).
  [InlineData("com.example/")]
  // Label with interior hyphen.
  [InlineData("a-b.c-d/the_name")]
  public void IsValidKey_accepts_well_formed_keys(string key)
  {
    Assert.True(MetaKeys.IsValidKey(key));
  }

  // --- IsValidKey: keys under a RESERVED prefix are NOT valid for third parties (§2.6.2-j). ---
  // This mirrors the TypeScript isValidMetaKey contract: a reserved-prefix key returns false even
  // though it is structurally well-formed, because validity folds in reserved-prefix rejection.

  [Theory]
  [InlineData("io.modelcontextprotocol/protocolVersion")]
  [InlineData("io.modelcontextprotocol/clientInfo")]
  [InlineData("io.modelcontextprotocol/tasks")]
  [InlineData("io.modelcontextprotocol.api.v2/key")]
  [InlineData("io.modelcontextprotocol/")]
  [InlineData("dev.mcp/key")]
  [InlineData("com.mcp.tools/widget")]
  public void IsValidKey_rejects_keys_under_a_reserved_prefix(string key)
  {
    Assert.False(MetaKeys.IsValidKey(key));
  }

  // --- IsValidKey: malformed keys (§4.2). ---

  [Theory]
  // Prefix label must start with a letter, not a digit.
  [InlineData("9com.example/tag")]
  [InlineData("0/name")]
  // Prefix label must not end with a hyphen.
  [InlineData("com.example-/tag")]
  [InlineData("a-/name")]
  // Empty / double-dot labels in the prefix.
  [InlineData("com..example/tag")]
  [InlineData(".com/tag")]
  [InlineData("com./tag")]
  // A leading slash (empty prefix) is not a valid prefix.
  [InlineData("/name")]
  // Name must start and end with an alphanumeric character.
  [InlineData("com.example/-name")]
  [InlineData("com.example/name-")]
  [InlineData("com.example/_name")]
  [InlineData("com.example/.name")]
  // Names with disallowed characters / whitespace.
  [InlineData("com.example/na me")]
  [InlineData("com example/tag")]
  [InlineData("com.example/na/me")] // second slash: the name segment itself contains '/'
  // Bare names that are themselves ill-formed.
  [InlineData("-name")]
  [InlineData("name-")]
  [InlineData("_underscore")]
  [InlineData("has space")]
  public void IsValidKey_rejects_malformed_keys(string key)
  {
    Assert.False(MetaKeys.IsValidKey(key));
  }

  [Fact]
  public void IsValidKey_accepts_the_empty_key_an_empty_name_is_valid()
  {
    // Faithful to the TypeScript SDK: isValidMetaKey('') folds to isValidMetaKeyName(''),
    // and an empty name is valid (a key with no prefix and an empty name). See meta-key.ts.
    Assert.True(MetaKeys.IsValidKey(""));
    Assert.True(MetaKeys.IsValidMetaKeyName(""));
  }

  [Fact]
  public void IsValidKey_throws_on_null()
  {
    Assert.Throws<ArgumentNullException>(() => MetaKeys.IsValidKey(null!));
  }

  // --- IsReservedPrefix: prefixes whose second label is modelcontextprotocol or mcp (§4.2). ---

  [Theory]
  [InlineData("io.modelcontextprotocol/protocolVersion")]
  [InlineData("io.modelcontextprotocol/anything")]
  [InlineData("dev.mcp/key")]
  [InlineData("org.modelcontextprotocol.api/key")]
  [InlineData("com.mcp.tools/key")]
  [InlineData("a.mcp/key")]
  [InlineData("x.modelcontextprotocol.y.z/key")]
  public void IsReservedPrefix_recognizes_protocol_owned_prefixes(string key)
  {
    Assert.True(MetaKeys.IsReservedPrefix(key));
  }

  [Theory]
  // Second label is not modelcontextprotocol / mcp.
  [InlineData("com.example/tag")]
  [InlineData("com.example.mcp/tag")] // second label is "example", not "mcp"
  [InlineData("com.example.modelcontextprotocol/tag")]
  [InlineData("org.acme/key")]
  // A single-label prefix has no second label.
  [InlineData("mcp/key")]
  [InlineData("modelcontextprotocol/key")]
  [InlineData("vendor/key")]
  // No prefix at all (bare keys, leading slash).
  [InlineData("progressToken")]
  [InlineData("traceparent")]
  [InlineData("/key")]
  [InlineData("name-only")]
  public void IsReservedPrefix_rejects_non_protocol_prefixes(string key)
  {
    Assert.False(MetaKeys.IsReservedPrefix(key));
  }

  [Fact]
  public void IsReservedPrefix_throws_on_null()
  {
    Assert.Throws<ArgumentNullException>(() => MetaKeys.IsReservedPrefix(null!));
  }

  [Fact]
  public void Canonical_protocol_keys_are_reserved_and_therefore_not_valid_for_third_parties()
  {
    // The key is structurally well-formed but sits under a reserved prefix, so IsValidKey — which
    // folds in reserved-prefix rejection (matching TS isValidMetaKey) — returns false.
    Assert.True(MetaKeys.IsReservedPrefix(MetaKeys.ProtocolVersion));
    Assert.False(MetaKeys.IsValidKey(MetaKeys.ProtocolVersion));
  }

  // ─── Standalone prefix validator (AC-02.17 — R-2.6.2-b, R-2.6.2-c, R-2.6.2-d). ───

  [Theory]
  [InlineData("example/")]
  [InlineData("com.example/")]
  [InlineData("io.modelcontextprotocol/")]
  [InlineData("com.my-company/")]
  public void IsValidMetaKeyPrefix_accepts_well_formed_prefixes(string prefix) =>
    Assert.True(MetaKeys.IsValidMetaKeyPrefix(prefix));

  [Theory]
  [InlineData("com.example")] // no trailing slash
  [InlineData("/")] // empty body
  [InlineData("")] // empty
  [InlineData("1bad/")] // label starts with a digit
  [InlineData("com.1bad/")] // second label starts with a digit
  [InlineData("com.bad-/")] // label ends with a hyphen
  [InlineData("com..example/")] // consecutive dots
  public void IsValidMetaKeyPrefix_rejects_malformed_prefixes(string prefix) =>
    Assert.False(MetaKeys.IsValidMetaKeyPrefix(prefix));

  // ─── Standalone reserved-prefix validator (AC-02.17 — R-2.6.2-f). ───

  [Theory]
  [InlineData("io.modelcontextprotocol/")]
  [InlineData("dev.mcp/")]
  [InlineData("org.modelcontextprotocol.api/")]
  [InlineData("com.mcp.tools/")]
  public void IsReservedMetaKeyPrefix_recognizes_reserved_prefixes(string prefix) =>
    Assert.True(MetaKeys.IsReservedMetaKeyPrefix(prefix));

  [Theory]
  [InlineData("com.example/")] // second label = example
  [InlineData("com.example.mcp/")] // second label = example, not mcp
  [InlineData("mcp/")] // single label has no second label
  public void IsReservedMetaKeyPrefix_rejects_non_reserved_prefixes(string prefix) =>
    Assert.False(MetaKeys.IsReservedMetaKeyPrefix(prefix));

  // ─── Standalone name validator (AC-02.18 — R-2.6.2-g, R-2.6.2-h). ───

  [Fact]
  public void IsValidMetaKeyName_accepts_an_empty_name() =>
    Assert.True(MetaKeys.IsValidMetaKeyName(""));

  [Theory]
  [InlineData("tenant")]
  [InlineData("logLevel")]
  [InlineData("protocolVersion")]
  [InlineData("my-key")]
  [InlineData("my_key")]
  [InlineData("my.key")]
  public void IsValidMetaKeyName_accepts_well_formed_names(string name) =>
    Assert.True(MetaKeys.IsValidMetaKeyName(name));

  [Theory]
  [InlineData("-bad")] // starts with a hyphen
  [InlineData("bad-")] // ends with a hyphen
  [InlineData("_bad")] // starts with an underscore
  public void IsValidMetaKeyName_rejects_malformed_names(string name) =>
    Assert.False(MetaKeys.IsValidMetaKeyName(name));

  // ─── ParseMetaKey: first-slash split rule. ───

  [Fact]
  public void ParseMetaKey_parses_a_key_without_prefix()
  {
    var parsed = MetaKeys.ParseMetaKey("traceparent");
    Assert.Null(parsed.Prefix);
    Assert.Equal("traceparent", parsed.Name);
  }

  [Fact]
  public void ParseMetaKey_parses_a_key_with_prefix()
  {
    var parsed = MetaKeys.ParseMetaKey("com.example/tenant");
    Assert.Equal("com.example/", parsed.Prefix);
    Assert.Equal("tenant", parsed.Name);
  }

  [Fact]
  public void ParseMetaKey_uses_the_first_slash_as_the_separator()
  {
    var parsed = MetaKeys.ParseMetaKey("a.b/c/d");
    Assert.Equal("a.b/", parsed.Prefix);
    Assert.Equal("c/d", parsed.Name);
  }

  // ─── IsValidKey: trace keys, bare names, invalid prefix syntax (AC-02.19). ───

  [Theory]
  [InlineData("tenant")] // bare name
  [InlineData("com.example/tenant")] // vendor-prefixed
  [InlineData("traceparent")] // W3C bare trace keys are always valid
  [InlineData("tracestate")]
  [InlineData("baggage")]
  public void IsValidKey_accepts_bare_names_vendor_keys_and_trace_keys(string key) =>
    Assert.True(MetaKeys.IsValidKey(key));

  [Fact]
  public void IsValidKey_rejects_a_key_with_invalid_prefix_syntax() =>
    Assert.False(MetaKeys.IsValidKey("1bad/key"));

  // ─── TraceContextKeys membership (AC-02.19 — R-2.6.2-i). ───

  [Fact]
  public void TraceContextKeys_contain_the_three_w3c_keys()
  {
    Assert.Contains("traceparent", MetaKeys.TraceContextKeys);
    Assert.Contains("tracestate", MetaKeys.TraceContextKeys);
    Assert.Contains("baggage", MetaKeys.TraceContextKeys);
  }

  [Fact]
  public void TraceContextKeys_do_not_contain_progressToken() =>
    Assert.DoesNotContain("progressToken", MetaKeys.TraceContextKeys);

  // ─── isValidTraceparent (AC-02.19 — R-2.6.2-i). ───

  [Fact]
  public void IsValidTraceparent_accepts_a_well_formed_value() =>
    Assert.True(MetaKeys.IsValidTraceparent(
      "00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01"));

  [Theory]
  [InlineData("not-a-traceparent")]
  [InlineData("")]
  public void IsValidTraceparent_rejects_malformed_values(string value) =>
    Assert.False(MetaKeys.IsValidTraceparent(value));

  [Fact]
  public void IsValidTraceparent_rejects_uppercase_hex() =>
    Assert.False(MetaKeys.IsValidTraceparent(
      "00-0AF7651916CD43DD8448EB211C80319C-00F067AA0BA902B7-01"));

  // ─── isValidTracestate (R-4.2-l). ───

  [Theory]
  [InlineData("rojo=00f067aa0ba902b7")]
  [InlineData("vendorname=opaqueValue,mynamespace=myvalue")]
  [InlineData("fw529a3039@dt=FxAAsdfh28")] // multi-tenant key
  public void IsValidTracestate_accepts_valid_values(string value) =>
    Assert.True(MetaKeys.IsValidTracestate(value));

  [Theory]
  [InlineData("")] // empty
  [InlineData("invalid")] // no '=' separator
  [InlineData("UserId=value")] // uppercase key
  [InlineData("@@@invalid@@@")] // malformed
  [InlineData("rojo=value,")] // trailing comma → empty member
  public void IsValidTracestate_rejects_invalid_values(string value) =>
    Assert.False(MetaKeys.IsValidTracestate(value));

  [Fact]
  public void IsValidTracestate_rejects_more_than_32_members()
  {
    // 33 valid members must be rejected (the limit is 32).
    var value = string.Join(",", Enumerable.Range(0, 33).Select(i => $"k{i}=v"));
    Assert.False(MetaKeys.IsValidTracestate(value));
  }

  // ─── isValidBaggage (R-4.2-m). ───

  [Theory]
  [InlineData("userId=alice")]
  [InlineData("userId=alice,serverNode=DF-28")]
  [InlineData("key=value;property=val")] // member with a property
  [InlineData("UserId=alice")] // baggage tokens are case-insensitive (RFC 7230)
  public void IsValidBaggage_accepts_valid_values(string value) =>
    Assert.True(MetaKeys.IsValidBaggage(value));

  [Theory]
  [InlineData("")] // empty
  [InlineData("invalid")] // no '=' separator
  [InlineData("@@@invalid@@@")] // malformed
  [InlineData("\"bad\"=value")] // key contains a double-quote (not a token char)
  public void IsValidBaggage_rejects_invalid_values(string value) =>
    Assert.False(MetaKeys.IsValidBaggage(value));

  // ─── isValidTraceContextValue (AC-02.19 — R-2.6.2-i). ───

  [Theory]
  [InlineData("key=value")] // valid tracestate form
  [InlineData("userId=alice,serverNode=DF-28")] // valid baggage form
  public void IsValidTraceContextValue_accepts_tracestate_or_baggage(string value) =>
    Assert.True(MetaKeys.IsValidTraceContextValue(value));

  [Theory]
  [InlineData("")] // empty
  [InlineData("@@@invalid@@@")] // neither tracestate nor baggage
  public void IsValidTraceContextValue_rejects_values_that_are_neither(string value) =>
    Assert.False(MetaKeys.IsValidTraceContextValue(value));
}
