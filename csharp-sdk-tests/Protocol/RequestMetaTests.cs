using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive coverage of the per-request <c>_meta</c> envelope (§4.3): emission of the three
/// REQUIRED reserved keys plus the optional log level and arbitrary passthrough keys
/// (<see cref="RequestMeta.ToJsonObject"/>), round-tripping through
/// <see cref="RequestMeta.Parse"/>, and rejection of malformed params with
/// <c>-32602</c> (Invalid params).
/// </summary>
public sealed class RequestMetaTests
{
  private static readonly Implementation SampleClient = new() { Name = "example-client", Version = "1.0.0" };

  private static RequestMeta NewMeta(
    ClientCapabilities? capabilities = null,
    string? logLevel = null,
    JsonObject? additional = null) =>
    new()
    {
      ProtocolVersion = ProtocolRevision.Current,
      ClientInfo = SampleClient,
      ClientCapabilities = capabilities ?? ClientCapabilities.None,
      LogLevel = logLevel,
      Additional = additional,
    };

  // ----- ToJsonObject: the three required reserved keys, verbatim (§4.3) -----

  [Fact]
  public void ToJsonObject_emits_the_three_required_keys_verbatim()
  {
    var meta = NewMeta().ToJsonObject();

    Assert.Equal(ProtocolRevision.Current, meta[MetaKeys.ProtocolVersion]!.GetValue<string>());
    Assert.Equal("example-client", meta[MetaKeys.ClientInfo]!["name"]!.GetValue<string>());
    Assert.IsType<JsonObject>(meta[MetaKeys.ClientCapabilities]);
  }

  [Theory]
  [InlineData("io.modelcontextprotocol/protocolVersion")]
  [InlineData("io.modelcontextprotocol/clientInfo")]
  [InlineData("io.modelcontextprotocol/clientCapabilities")]
  public void ToJsonObject_uses_the_dotted_reserved_key_names(string key)
  {
    var meta = NewMeta().ToJsonObject();
    Assert.True(meta.ContainsKey(key));
  }

  // ----- ToJsonObject: optional logLevel (§4.3/§15.3) -----

  [Fact]
  public void ToJsonObject_emits_log_level_when_set()
  {
    var meta = NewMeta(logLevel: "warning").ToJsonObject();
    Assert.Equal("warning", meta[MetaKeys.LogLevel]!.GetValue<string>());
  }

  [Fact]
  public void ToJsonObject_omits_log_level_when_null()
  {
    var meta = NewMeta().ToJsonObject();
    Assert.False(meta.ContainsKey(MetaKeys.LogLevel));
  }

  // ----- ToJsonObject: Additional passthrough (progress, trace, third-party) (§4.2) -----

  [Theory]
  [InlineData("progressToken")]
  [InlineData("traceparent")]
  [InlineData("tracestate")]
  [InlineData("baggage")]
  [InlineData("com.thirdparty/customKey")]
  public void ToJsonObject_carries_additional_keys_through_unchanged(string key)
  {
    var meta = NewMeta(additional: new JsonObject { [key] = "value-1" }).ToJsonObject();
    Assert.Equal("value-1", meta[key]!.GetValue<string>());
  }

  [Fact]
  public void ToJsonObject_carries_a_numeric_progress_token()
  {
    var meta = NewMeta(additional: new JsonObject { [MetaKeys.ProgressToken] = 42 }).ToJsonObject();
    Assert.Equal(42, meta[MetaKeys.ProgressToken]!.GetValue<int>());
  }

  [Fact]
  public void ToJsonObject_lets_required_keys_override_additional_of_the_same_name()
  {
    // Additional is applied first, then the protocol-defined keys, so the reserved key wins.
    var meta = NewMeta(additional: new JsonObject { [MetaKeys.ProtocolVersion] = "stale" }).ToJsonObject();
    Assert.Equal(ProtocolRevision.Current, meta[MetaKeys.ProtocolVersion]!.GetValue<string>());
  }

  // ----- Parse: round-trip (§4.3) -----

  [Fact]
  public void Parse_round_trips_the_required_keys()
  {
    var paramsObject = new JsonObject { ["_meta"] = NewMeta().ToJsonObject() };
    var parsed = RequestMeta.Parse(paramsObject);

    Assert.Equal(ProtocolRevision.Current, parsed.ProtocolVersion);
    Assert.Equal("example-client", parsed.ClientInfo.Name);
    Assert.Equal("1.0.0", parsed.ClientInfo.Version);
  }

  [Fact]
  public void Parse_round_trips_the_optional_log_level()
  {
    var paramsObject = new JsonObject { ["_meta"] = NewMeta(logLevel: "info").ToJsonObject() };
    Assert.Equal("info", RequestMeta.Parse(paramsObject).LogLevel);
  }

  [Fact]
  public void Parse_leaves_log_level_null_when_absent()
  {
    var paramsObject = new JsonObject { ["_meta"] = NewMeta().ToJsonObject() };
    Assert.Null(RequestMeta.Parse(paramsObject).LogLevel);
  }

  [Theory]
  [InlineData("progressToken")]
  [InlineData("traceparent")]
  [InlineData("com.thirdparty/customKey")]
  public void Parse_preserves_additional_keys(string key)
  {
    var paramsObject = new JsonObject
    {
      ["_meta"] = NewMeta(additional: new JsonObject { [key] = "kept" }).ToJsonObject(),
    };
    var parsed = RequestMeta.Parse(paramsObject);
    Assert.NotNull(parsed.Additional);
    Assert.Equal("kept", parsed.Additional![key]!.GetValue<string>());
  }

  [Fact]
  public void Parse_does_not_leak_reserved_keys_into_additional()
  {
    var paramsObject = new JsonObject
    {
      ["_meta"] = NewMeta(logLevel: "info", additional: new JsonObject { ["progressToken"] = "p" }).ToJsonObject(),
    };
    var parsed = RequestMeta.Parse(paramsObject);

    Assert.NotNull(parsed.Additional);
    Assert.False(parsed.Additional!.ContainsKey(MetaKeys.ProtocolVersion));
    Assert.False(parsed.Additional.ContainsKey(MetaKeys.ClientInfo));
    Assert.False(parsed.Additional.ContainsKey(MetaKeys.ClientCapabilities));
    Assert.False(parsed.Additional.ContainsKey(MetaKeys.LogLevel));
    Assert.True(parsed.Additional.ContainsKey("progressToken"));
  }

  [Fact]
  public void Parse_yields_null_additional_when_only_reserved_keys_present()
  {
    var paramsObject = new JsonObject { ["_meta"] = NewMeta().ToJsonObject() };
    Assert.Null(RequestMeta.Parse(paramsObject).Additional);
  }

  // ----- Parse: extracts client capability sub-flags (§4.3/§6.2) -----

  [Fact]
  public void Parse_extracts_client_capability_sub_flags()
  {
    var caps = new ClientCapabilities
    {
      Elicitation = new ElicitationCapability { Form = new JsonObject(), Url = new JsonObject() },
      Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject() },
    };
    var paramsObject = new JsonObject { ["_meta"] = NewMeta(capabilities: caps).ToJsonObject() };
    var parsed = RequestMeta.Parse(paramsObject);

    Assert.True(parsed.ClientCapabilities.SupportsElicitation);
    Assert.True(parsed.ClientCapabilities.SupportsElicitationUrl);
    Assert.True(parsed.ClientCapabilities.HasExtension(MetaKeys.TasksExtension));
  }

  [Fact]
  public void Parse_reads_empty_client_capabilities_as_no_support()
  {
    var paramsObject = new JsonObject { ["_meta"] = NewMeta().ToJsonObject() };
    var parsed = RequestMeta.Parse(paramsObject);

    Assert.False(parsed.ClientCapabilities.SupportsElicitation);
    Assert.False(parsed.ClientCapabilities.SupportsSampling);
    Assert.False(parsed.ClientCapabilities.SupportsRoots);
  }

  // ----- Parse: rejects malformed params with -32602 (§4.3, §6.4 rule 5) -----

  [Theory]
  // _meta itself missing or wrong-typed.
  [InlineData("""{}""")]
  [InlineData("""{"_meta":null}""")]
  [InlineData("""{"_meta":"not-an-object"}""")]
  [InlineData("""{"_meta":[1,2,3]}""")]
  [InlineData("""{"_meta":42}""")]
  // protocolVersion missing.
  [InlineData("""{"_meta":{"io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  // clientInfo missing.
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}""")]
  // clientCapabilities missing.
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"}}}""")]
  // all reserved keys missing.
  [InlineData("""{"_meta":{}}""")]
  public void Parse_rejects_missing_required_keys_with_invalid_params(string paramsJson)
  {
    var paramsObject = JsonNode.Parse(paramsJson)!.AsObject();
    var error = Assert.Throws<McpError>(() => RequestMeta.Parse(paramsObject));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Fact]
  public void Parse_rejects_null_params_with_invalid_params()
  {
    var error = Assert.Throws<McpError>(() => RequestMeta.Parse(null));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Theory]
  // protocolVersion present but not a string.
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":7,"io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":{},"io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":null,"io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":true,"io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  public void Parse_rejects_wrong_typed_protocol_version_with_invalid_params(string paramsJson)
  {
    var paramsObject = JsonNode.Parse(paramsJson)!.AsObject();
    var error = Assert.Throws<McpError>(() => RequestMeta.Parse(paramsObject));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Theory]
  // clientInfo present but not an object.
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":"x","io.modelcontextprotocol/clientCapabilities":{}}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":[1],"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  // clientInfo an object but missing its required name/version members.
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"c"},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}""")]
  public void Parse_rejects_wrong_typed_or_incomplete_client_info_with_invalid_params(string paramsJson)
  {
    var paramsObject = JsonNode.Parse(paramsJson)!.AsObject();
    var error = Assert.Throws<McpError>(() => RequestMeta.Parse(paramsObject));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Theory]
  // clientCapabilities present but not an object.
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":"x"}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":[1]}}""")]
  [InlineData("""{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"c","version":"1"},"io.modelcontextprotocol/clientCapabilities":42}}""")]
  public void Parse_rejects_wrong_typed_client_capabilities_with_invalid_params(string paramsJson)
  {
    var paramsObject = JsonNode.Parse(paramsJson)!.AsObject();
    var error = Assert.Throws<McpError>(() => RequestMeta.Parse(paramsObject));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  // ----- A complete, well-formed envelope parses cleanly (§5.2 example) -----

  [Fact]
  public void Parse_accepts_a_complete_well_formed_envelope()
  {
    const string paramsJson =
      """{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"ExampleClient","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}""";
    var paramsObject = JsonNode.Parse(paramsJson)!.AsObject();

    var parsed = RequestMeta.Parse(paramsObject);

    Assert.Equal("2026-07-28", parsed.ProtocolVersion);
    Assert.Equal("ExampleClient", parsed.ClientInfo.Name);
    Assert.Equal("1.0.0", parsed.ClientInfo.Version);
    Assert.Null(parsed.Additional);
  }

  // ----- Revision-format gate: malformed-but-string protocolVersion → -32602 (§5.1, R-5.2-b) -----

  private static JsonObject MetaWith(string protocolVersion) =>
    new()
    {
      ["_meta"] = new JsonObject
      {
        [MetaKeys.ProtocolVersion] = protocolVersion,
        [MetaKeys.ClientInfo] = new JsonObject { ["name"] = "c", ["version"] = "1" },
        [MetaKeys.ClientCapabilities] = new JsonObject(),
      },
    };

  [Theory]
  // A non-date label, a slash-separated date, single-digit components, an ISO datetime with a time
  // component, surrounding whitespace, and a digits-only string are all malformed revision identifiers.
  [InlineData("latest")]
  [InlineData("v1.0")]
  [InlineData("2026/07/28")]
  [InlineData("2026-7-28")]
  [InlineData("2026-07-28T00:00:00Z")]
  [InlineData(" 2026-07-28")]
  [InlineData("2026-07-28 ")]
  [InlineData("20260728")]
  [InlineData("")]
  public void Parse_rejects_a_malformed_but_string_protocol_version_with_invalid_params(string protocolVersion)
  {
    var error = Assert.Throws<McpError>(() => RequestMeta.Parse(MetaWith(protocolVersion)));
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
  }

  [Theory]
  // Format validity is independent of support: a well-formed but unsupported revision passes the gate
  // (an unsupported one is handled later by the negotiation layer with -32004, not at the gate).
  [InlineData("2026-07-28")]
  [InlineData("2019-01-01")]
  [InlineData("2099-12-31")]
  public void Parse_accepts_any_well_formed_yyyy_mm_dd_protocol_version(string protocolVersion)
  {
    var parsed = RequestMeta.Parse(MetaWith(protocolVersion));
    Assert.Equal(protocolVersion, parsed.ProtocolVersion);
  }

  [Theory]
  [InlineData("2026-07-28", true)]
  [InlineData("2019-01-01", true)]
  [InlineData("2099-12-31", true)]
  [InlineData("latest", false)]
  [InlineData("v1.0", false)]
  [InlineData("2026/07/28", false)]
  [InlineData("2026-7-28", false)]
  [InlineData("2026-07-28T00:00:00Z", false)]
  [InlineData(" 2026-07-28", false)]
  [InlineData("2026-07-28 ", false)]
  [InlineData("20260728", false)]
  [InlineData("", false)]
  public void IsValidRevisionFormat_checks_the_yyyy_mm_dd_layout_only(string revision, bool expected)
  {
    Assert.Equal(expected, RequestMeta.IsValidRevisionFormat(revision));
  }
}

/// <summary>
/// Coverage for the <see cref="LoggingLevel"/> enum: the eight RFC 5424 values, their exact lowercase
/// wire strings, ascending-severity ordering (<see cref="LoggingLevelExtensions.Index"/>), and the
/// at-or-above filtering rule (<see cref="LoggingLevelExtensions.IsAtOrAbove"/>) per §4.3 / R-4.3-m.
/// </summary>
public sealed class LoggingLevelTests
{
  [Fact]
  public void There_are_exactly_eight_levels()
  {
    Assert.Equal(8, Enum.GetValues<LoggingLevel>().Length);
  }

  [Theory]
  [InlineData(LoggingLevel.Debug, "debug")]
  [InlineData(LoggingLevel.Info, "info")]
  [InlineData(LoggingLevel.Notice, "notice")]
  [InlineData(LoggingLevel.Warning, "warning")]
  [InlineData(LoggingLevel.Error, "error")]
  [InlineData(LoggingLevel.Critical, "critical")]
  [InlineData(LoggingLevel.Alert, "alert")]
  [InlineData(LoggingLevel.Emergency, "emergency")]
  public void Each_level_serializes_to_its_exact_lowercase_wire_string(LoggingLevel level, string expected)
  {
    Assert.Equal($"\"{expected}\"", McpJson.Serialize(level));
  }

  [Theory]
  [InlineData("\"debug\"", LoggingLevel.Debug)]
  [InlineData("\"warning\"", LoggingLevel.Warning)]
  [InlineData("\"emergency\"", LoggingLevel.Emergency)]
  public void Each_wire_string_deserializes_to_its_level(string json, LoggingLevel expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<LoggingLevel>(json));
  }

  [Fact]
  public void Index_is_ascending_by_severity()
  {
    Assert.Equal(0, LoggingLevel.Debug.Index());
    Assert.Equal(7, LoggingLevel.Emergency.Index());
    Assert.True(LoggingLevel.Debug.Index() < LoggingLevel.Info.Index());
    Assert.True(LoggingLevel.Warning.Index() < LoggingLevel.Error.Index());
  }

  [Theory]
  // candidate at or above minimum → true.
  [InlineData(LoggingLevel.Error, LoggingLevel.Warning, true)]
  [InlineData(LoggingLevel.Warning, LoggingLevel.Warning, true)]
  [InlineData(LoggingLevel.Emergency, LoggingLevel.Debug, true)]
  // candidate below minimum → false.
  [InlineData(LoggingLevel.Info, LoggingLevel.Warning, false)]
  [InlineData(LoggingLevel.Debug, LoggingLevel.Emergency, false)]
  public void IsAtOrAbove_implements_the_server_filtering_rule(
    LoggingLevel candidate, LoggingLevel minimum, bool expected)
  {
    Assert.Equal(expected, candidate.IsAtOrAbove(minimum));
  }
}
