using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Json;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive coverage of capability presence semantics (§6.1), the
/// <see cref="ClientCapabilities"/> / <see cref="ServerCapabilities"/> wire shapes (§6.2/§6.3),
/// the extensions map (§6.5), and forward compatibility (§6.6). The governing rule is that a
/// capability is declared by the <em>presence</em> of its field — even an empty object <c>{}</c>
/// means "supported" — and absence (a <c>null</c> member here) means "not supported".
/// </summary>
public sealed class CapabilitiesWireTests
{
  // ----- ClientCapabilities: absent fields are omitted on serialize (§6.1) -----

  [Theory]
  [InlineData("elicitation")]
  [InlineData("roots")]
  [InlineData("sampling")]
  [InlineData("experimental")]
  [InlineData("extensions")]
  public void ClientCapabilities_omits_absent_fields(string field)
  {
    var json = McpJson.Serialize(ClientCapabilities.None);
    Assert.DoesNotContain($"\"{field}\":", json);
  }

  [Fact]
  public void ClientCapabilities_none_serializes_as_empty_object()
  {
    Assert.Equal("{}", McpJson.Serialize(ClientCapabilities.None));
  }

  // ----- Empty object means present/supported (§6.1) -----

  [Fact]
  public void ClientCapabilities_empty_elicitation_object_means_supported()
  {
    var caps = new ClientCapabilities { Elicitation = new ElicitationCapability() };
    var json = McpJson.Serialize(caps);
    Assert.Contains("\"elicitation\":{}", json);
    Assert.True(caps.SupportsElicitation);
  }

  [Fact]
  public void ClientCapabilities_empty_roots_object_means_supported()
  {
    var caps = new ClientCapabilities { Roots = new JsonObject() };
    var json = McpJson.Serialize(caps);
    Assert.Contains("\"roots\":{}", json);
    Assert.True(caps.SupportsRoots);
  }

  // ----- SupportsElicitation accessor over many JSON inputs (§6.2) -----

  [Theory]
  [InlineData("""{}""", false)]
  [InlineData("""{"elicitation":{}}""", true)]
  [InlineData("""{"elicitation":{"form":{}}}""", true)]
  [InlineData("""{"elicitation":{"url":{}}}""", true)]
  [InlineData("""{"elicitation":{"form":{},"url":{}}}""", true)]
  [InlineData("""{"sampling":{}}""", false)]
  public void SupportsElicitation_reflects_field_presence(string json, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.SupportsElicitation);
  }

  // ----- SupportsElicitationUrl: only when the url sub-flag is present (§6.2) -----

  [Theory]
  [InlineData("""{}""", false)]
  [InlineData("""{"elicitation":{}}""", false)]
  [InlineData("""{"elicitation":{"form":{}}}""", false)]
  [InlineData("""{"elicitation":{"url":{}}}""", true)]
  [InlineData("""{"elicitation":{"form":{},"url":{}}}""", true)]
  public void SupportsElicitationUrl_requires_the_url_sub_flag(string json, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.SupportsElicitationUrl);
  }

  // ----- SupportsSampling accessor (§21) -----

  [Theory]
  [InlineData("""{}""", false)]
  [InlineData("""{"sampling":{}}""", true)]
  [InlineData("""{"sampling":{"context":{}}}""", true)]
  [InlineData("""{"sampling":{"tools":{}}}""", true)]
  [InlineData("""{"elicitation":{}}""", false)]
  public void SupportsSampling_reflects_field_presence(string json, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.SupportsSampling);
  }

  // ----- SupportsRoots accessor (§21) -----

  [Theory]
  [InlineData("""{}""", false)]
  [InlineData("""{"roots":{}}""", true)]
  [InlineData("""{"roots":{"listChanged":true}}""", true)]
  [InlineData("""{"sampling":{}}""", false)]
  public void SupportsRoots_reflects_field_presence(string json, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.SupportsRoots);
  }

  // R-21.1.2-a: the `roots` capability value MUST be a JSON object; a non-object value (boolean,
  // array, string, number, null) is invalid and is NOT a declaration of the capability.
  [Theory]
  [InlineData("""{"roots":{}}""", true)]
  [InlineData("""{"roots":{"listChanged":true}}""", true)]
  [InlineData("""{"roots":true}""", false)]
  [InlineData("""{"roots":[]}""", false)]
  [InlineData("""{"roots":"yes"}""", false)]
  [InlineData("""{"roots":1}""", false)]
  [InlineData("""{"roots":null}""", false)]
  [InlineData("""{}""", false)]
  public void ClientDeclares_roots_only_when_the_value_is_a_json_object(string json, bool expected) =>
    Assert.Equal(expected, CapabilityNegotiation.ClientDeclares(JsonNode.Parse(json)!.AsObject(), "roots"));

  // ----- Elicitation form/url presence round-trip (§6.2) -----

  [Fact]
  public void ElicitationCapability_form_and_url_round_trip()
  {
    var caps = new ClientCapabilities
    {
      Elicitation = new ElicitationCapability { Form = new JsonObject(), Url = new JsonObject() },
    };
    var json = McpJson.Serialize(caps);
    Assert.Contains("\"form\":{}", json);
    Assert.Contains("\"url\":{}", json);

    var back = McpJson.Deserialize<ClientCapabilities>(json)!;
    Assert.True(back.SupportsElicitation);
    Assert.True(back.SupportsElicitationUrl);
  }

  [Fact]
  public void ElicitationCapability_omits_absent_sub_flags()
  {
    var json = McpJson.Serialize(new ElicitationCapability { Form = new JsonObject() });
    Assert.Contains("\"form\":{}", json);
    Assert.DoesNotContain("\"url\":", json);
  }

  [Fact]
  public void SamplingCapability_sub_flags_round_trip()
  {
    var caps = new ClientCapabilities
    {
      Sampling = new SamplingCapability { Context = new JsonObject(), Tools = new JsonObject() },
    };
    var json = McpJson.Serialize(caps);
    Assert.Contains("\"context\":{}", json);
    Assert.Contains("\"tools\":{}", json);

    var back = McpJson.Deserialize<ClientCapabilities>(json)!;
    Assert.True(back.SupportsSampling);
    Assert.NotNull(back.Sampling!.Context);
    Assert.NotNull(back.Sampling.Tools);
  }

  // ----- ClientCapabilities.HasExtension over many inputs (§6.5) -----

  [Theory]
  [InlineData("""{}""", "io.modelcontextprotocol/tasks", false)]
  [InlineData("""{"extensions":{}}""", "io.modelcontextprotocol/tasks", false)]
  [InlineData("""{"extensions":{"io.modelcontextprotocol/tasks":{}}}""", "io.modelcontextprotocol/tasks", true)]
  [InlineData("""{"extensions":{"io.modelcontextprotocol/tasks":{}}}""", "io.modelcontextprotocol/ui", false)]
  [InlineData("""{"extensions":{"com.example/x":{"setting":1}}}""", "com.example/x", true)]
  public void ClientCapabilities_HasExtension_matches_advertised_identifiers(string json, string id, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.HasExtension(id));
  }

  [Fact]
  public void ClientCapabilities_extensions_carry_settings_objects()
  {
    var caps = new ClientCapabilities
    {
      Extensions = new Dictionary<string, JsonObject>
      {
        [MetaKeys.UiExtension] = new JsonObject { ["mimeTypes"] = new JsonArray("text/html;profile=mcp-app") },
      },
    };
    var json = McpJson.Serialize(caps);
    Assert.Contains("\"io.modelcontextprotocol/ui\":{\"mimeTypes\":[\"text/html;profile=mcp-app\"]}", json);

    var back = McpJson.Deserialize<ClientCapabilities>(json)!;
    Assert.True(back.HasExtension(MetaKeys.UiExtension));
  }

  [Fact]
  public void ClientCapabilities_experimental_map_round_trips()
  {
    var caps = new ClientCapabilities
    {
      Experimental = new Dictionary<string, JsonObject> { ["customThing"] = new JsonObject { ["v"] = 1 } },
    };
    var json = McpJson.Serialize(caps);
    Assert.Contains("\"experimental\":{\"customThing\":{\"v\":1}}", json);

    var back = McpJson.Deserialize<ClientCapabilities>(json)!;
    Assert.Equal(1, back.Experimental!["customThing"]!["v"]!.GetValue<int>());
  }

  [Theory]
  [InlineData("""{"extensions":{"a/b":[]}}""")]   // array value
  [InlineData("""{"extensions":{"a/b":42}}""")]   // scalar value
  [InlineData("""{"extensions":{"a/b":"x"}}""")]  // string value
  [InlineData("""{"extensions":{"a/b":null}}""")] // null value (R-6.5-i)
  public void ClientCapabilities_extensions_drops_a_malformed_entry_without_rejecting_the_request(string json)
  {
    // §6.5 (R-6.5-i/j) + §6.6: a malformed extension settings value MUST be ignored (treated as not
    // advertised), and its presence MUST NOT cause the capability object — or the message carrying it —
    // to be rejected. Binding must succeed and simply drop the offending entry.
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options)!;
    Assert.False(caps.HasExtension("a/b"));
    Assert.NotNull(caps.Extensions);
    Assert.False(caps.Extensions!.ContainsKey("a/b"));
  }

  [Fact]
  public void ClientCapabilities_extensions_keeps_valid_siblings_when_dropping_a_malformed_entry()
  {
    // The drop is per-ENTRY: a valid sibling alongside a malformed entry is retained.
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(
      """{"extensions":{"a/b":[],"com.example/x":{"setting":1}}}""", McpJson.Options)!;
    Assert.False(caps.HasExtension("a/b"));
    Assert.True(caps.HasExtension("com.example/x"));
  }

  [Fact]
  public void ClientCapabilities_experimental_drops_a_malformed_entry_without_rejecting_the_request()
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(
      """{"experimental":{"weird":[1,2],"customThing":{"v":1}}}""", McpJson.Options)!;
    Assert.NotNull(caps.Experimental);
    Assert.False(caps.Experimental!.ContainsKey("weird"));
    Assert.True(caps.Experimental!.ContainsKey("customThing"));
  }

  [Fact]
  public void ClientCapabilities_extensions_map_that_is_not_an_object_is_a_structural_error()
  {
    // The forward-compat tolerance is per-entry; the MAP itself MUST be a JSON object. A non-object
    // map (e.g. an array) is a genuine structural error, not a droppable entry.
    Assert.ThrowsAny<JsonException>(() =>
      JsonSerializer.Deserialize<ClientCapabilities>("""{"extensions":[]}""", McpJson.Options));
  }

  // ----- ServerCapabilities: absent fields omitted (§6.1) -----

  [Theory]
  [InlineData("logging")]
  [InlineData("completions")]
  [InlineData("prompts")]
  [InlineData("resources")]
  [InlineData("tools")]
  [InlineData("experimental")]
  [InlineData("extensions")]
  public void ServerCapabilities_omits_absent_fields(string field)
  {
    var json = McpJson.Serialize(new ServerCapabilities());
    Assert.DoesNotContain($"\"{field}\":", json);
  }

  [Fact]
  public void ServerCapabilities_empty_serializes_as_empty_object()
  {
    Assert.Equal("{}", McpJson.Serialize(new ServerCapabilities()));
  }

  // ----- ServerCapabilities: presence-only flags as empty objects (§6.3) -----

  [Fact]
  public void ServerCapabilities_completions_and_logging_serialize_as_empty_objects()
  {
    var caps = new ServerCapabilities { Completions = new JsonObject(), Logging = new JsonObject() };
    var json = McpJson.Serialize(caps);
    Assert.Contains("\"logging\":{}", json);
    Assert.Contains("\"completions\":{}", json);
  }

  // ----- tools.listChanged sub-flag: serialize when set, omit when null (§6.3) -----

  [Theory]
  [InlineData(true, "\"tools\":{\"listChanged\":true}")]
  [InlineData(false, "\"tools\":{\"listChanged\":false}")]
  public void ToolsCapability_list_changed_serializes_when_set(bool listChanged, string expected)
  {
    var json = McpJson.Serialize(new ServerCapabilities { Tools = new ToolsCapability { ListChanged = listChanged } });
    Assert.Contains(expected, json);
  }

  [Fact]
  public void ToolsCapability_omits_list_changed_when_null()
  {
    var json = McpJson.Serialize(new ServerCapabilities { Tools = new ToolsCapability() });
    Assert.Contains("\"tools\":{}", json);
    Assert.DoesNotContain("listChanged", json);
  }

  // ----- prompts.listChanged sub-flag (§6.3) -----

  [Theory]
  [InlineData(true, "\"prompts\":{\"listChanged\":true}")]
  [InlineData(false, "\"prompts\":{\"listChanged\":false}")]
  public void PromptsCapability_list_changed_serializes_when_set(bool listChanged, string expected)
  {
    var json = McpJson.Serialize(new ServerCapabilities { Prompts = new PromptsCapability { ListChanged = listChanged } });
    Assert.Contains(expected, json);
  }

  [Fact]
  public void PromptsCapability_omits_list_changed_when_null()
  {
    var json = McpJson.Serialize(new ServerCapabilities { Prompts = new PromptsCapability() });
    Assert.Contains("\"prompts\":{}", json);
    Assert.DoesNotContain("listChanged", json);
  }

  // ----- resources.subscribe / listChanged sub-flags (§6.3) -----

  [Theory]
  [InlineData(true, null, "\"resources\":{\"subscribe\":true}")]
  [InlineData(null, true, "\"resources\":{\"listChanged\":true}")]
  [InlineData(true, true, "\"resources\":{\"subscribe\":true,\"listChanged\":true}")]
  [InlineData(false, false, "\"resources\":{\"subscribe\":false,\"listChanged\":false}")]
  public void ResourcesCapability_sub_flags_serialize_when_set(bool? subscribe, bool? listChanged, string expected)
  {
    var caps = new ServerCapabilities
    {
      Resources = new ResourcesCapability { Subscribe = subscribe, ListChanged = listChanged },
    };
    Assert.Contains(expected, McpJson.Serialize(caps));
  }

  [Fact]
  public void ResourcesCapability_omits_both_sub_flags_when_null()
  {
    var json = McpJson.Serialize(new ServerCapabilities { Resources = new ResourcesCapability() });
    Assert.Contains("\"resources\":{}", json);
    Assert.DoesNotContain("subscribe", json);
    Assert.DoesNotContain("listChanged", json);
  }

  [Theory]
  [InlineData("""{"resources":{"subscribe":true}}""", true, null)]
  [InlineData("""{"resources":{"listChanged":true}}""", null, true)]
  [InlineData("""{"resources":{"subscribe":true,"listChanged":false}}""", true, false)]
  [InlineData("""{"resources":{}}""", null, null)]
  public void ResourcesCapability_sub_flags_deserialize(string json, bool? subscribe, bool? listChanged)
  {
    var caps = JsonSerializer.Deserialize<ServerCapabilities>(json, McpJson.Options)!;
    Assert.Equal(subscribe, caps.Resources!.Subscribe);
    Assert.Equal(listChanged, caps.Resources.ListChanged);
  }

  // ----- ServerCapabilities.HasExtension over many inputs (§6.5) -----

  [Theory]
  [InlineData("""{}""", "io.modelcontextprotocol/tasks", false)]
  [InlineData("""{"extensions":{"io.modelcontextprotocol/tasks":{}}}""", "io.modelcontextprotocol/tasks", true)]
  [InlineData("""{"extensions":{"io.modelcontextprotocol/tasks":{}}}""", "io.modelcontextprotocol/ui", false)]
  [InlineData("""{"extensions":{"com.example/y":{}}}""", "com.example/y", true)]
  public void ServerCapabilities_HasExtension_matches_advertised_identifiers(string json, string id, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ServerCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.HasExtension(id));
  }

  // ----- Forward compatibility: unknown fields ignored, not rejected (§6.6) -----

  [Theory]
  [InlineData("""{"unknownCapability":{}}""")]
  [InlineData("""{"futureThing":true,"elicitation":{}}""")]
  [InlineData("""{"elicitation":{"form":{},"someFutureMode":{}}}""")]
  [InlineData("""{"extensions":{"x/y":{}},"brandNewTopLevel":[1,2,3]}""")]
  public void ClientCapabilities_ignores_unknown_fields(string json)
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options);
    Assert.NotNull(caps);
  }

  [Theory]
  [InlineData("""{"unknownCapability":{}}""")]
  [InlineData("""{"tools":{"listChanged":true},"futureCapability":{"x":1}}""")]
  [InlineData("""{"resources":{"subscribe":true,"futureSubFlag":true}}""")]
  public void ServerCapabilities_ignores_unknown_fields(string json)
  {
    var caps = JsonSerializer.Deserialize<ServerCapabilities>(json, McpJson.Options);
    Assert.NotNull(caps);
  }

  [Fact]
  public void ClientCapabilities_ignores_unknown_fields_but_keeps_known_ones()
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(
      """{"unknownTopLevel":{"a":1},"elicitation":{"url":{}},"extensions":{"io.modelcontextprotocol/tasks":{}}}""",
      McpJson.Options)!;

    Assert.True(caps.SupportsElicitation);
    Assert.True(caps.SupportsElicitationUrl);
    Assert.True(caps.HasExtension(MetaKeys.TasksExtension));
  }

  // ----- Full §6.7 example shapes round-trip -----

  [Fact]
  public void ServerCapabilities_full_example_round_trips()
  {
    var caps = new ServerCapabilities
    {
      Tools = new ToolsCapability { ListChanged = true },
      Resources = new ResourcesCapability { Subscribe = true, ListChanged = true },
      Prompts = new PromptsCapability { ListChanged = false },
      Completions = new JsonObject(),
      Extensions = new Dictionary<string, JsonObject> { [MetaKeys.TasksExtension] = new JsonObject() },
    };
    var json = McpJson.Serialize(caps);

    Assert.Contains("\"tools\":{\"listChanged\":true}", json);
    Assert.Contains("\"resources\":{\"subscribe\":true,\"listChanged\":true}", json);
    Assert.Contains("\"prompts\":{\"listChanged\":false}", json);
    Assert.Contains("\"completions\":{}", json);

    var back = McpJson.Deserialize<ServerCapabilities>(json)!;
    Assert.True(back.Tools!.ListChanged);
    Assert.True(back.Resources!.Subscribe);
    Assert.True(back.Resources.ListChanged);
    Assert.False(back.Prompts!.ListChanged);
    Assert.True(back.HasExtension(MetaKeys.TasksExtension));
  }

  // ----- Typed ClientCapabilities declaration accessors (§6.2) -----

  [Theory]
  [InlineData("""{}""", false, false, false, false)]
  [InlineData("""{"sampling":{}}""", false, false, false, false)]
  [InlineData("""{"sampling":{"context":{}}}""", false, false, true, false)]
  [InlineData("""{"sampling":{"tools":{}}}""", false, false, false, true)]
  [InlineData("""{"experimental":{},"extensions":{}}""", true, true, false, false)]
  public void ClientCapabilities_typed_subflag_accessors_reflect_presence(
    string json, bool experimental, bool extensions, bool samplingContext, bool samplingTools)
  {
    var caps = JsonSerializer.Deserialize<ClientCapabilities>(json, McpJson.Options)!;
    Assert.Equal(experimental, caps.SupportsExperimental);
    Assert.Equal(extensions, caps.SupportsExtensions);
    Assert.Equal(samplingContext, caps.SupportsSamplingContext);
    Assert.Equal(samplingTools, caps.SupportsSamplingTools);
  }

  // ----- Typed ServerCapabilities declaration accessors with "true-only" sub-flags (§6.3) -----

  [Fact]
  public void ServerCapabilities_typed_presence_accessors_reflect_field_presence()
  {
    var caps = JsonSerializer.Deserialize<ServerCapabilities>(
      """{"prompts":{},"resources":{},"tools":{},"completions":{},"logging":{}}""", McpJson.Options)!;
    Assert.True(caps.DeclaresPrompts);
    Assert.True(caps.DeclaresResources);
    Assert.True(caps.DeclaresTools);
    Assert.True(caps.DeclaresCompletions);
    Assert.True(caps.DeclaresLogging);
  }

  [Theory]
  // The boolean sub-flags are declared only when explicitly true (absent or false ⇒ not declared).
  [InlineData("""{"tools":{"listChanged":true}}""", true)]
  [InlineData("""{"tools":{"listChanged":false}}""", false)]
  [InlineData("""{"tools":{}}""", false)]
  [InlineData("""{}""", false)]
  public void ServerCapabilities_tools_list_changed_is_declared_only_when_true(string json, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ServerCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.DeclaresToolsListChanged);
  }

  [Theory]
  [InlineData("""{"resources":{"subscribe":true,"listChanged":false}}""", true, false)]
  [InlineData("""{"resources":{"subscribe":false,"listChanged":true}}""", false, true)]
  [InlineData("""{"resources":{}}""", false, false)]
  public void ServerCapabilities_resources_sub_flags_are_declared_only_when_true(
    string json, bool subscribe, bool listChanged)
  {
    var caps = JsonSerializer.Deserialize<ServerCapabilities>(json, McpJson.Options)!;
    Assert.Equal(subscribe, caps.DeclaresResourcesSubscribe);
    Assert.Equal(listChanged, caps.DeclaresResourcesListChanged);
  }

  [Theory]
  [InlineData("""{"prompts":{"listChanged":true}}""", true)]
  [InlineData("""{"prompts":{}}""", false)]
  public void ServerCapabilities_prompts_list_changed_is_declared_only_when_true(string json, bool expected)
  {
    var caps = JsonSerializer.Deserialize<ServerCapabilities>(json, McpJson.Options)!;
    Assert.Equal(expected, caps.DeclaresPromptsListChanged);
  }
}
