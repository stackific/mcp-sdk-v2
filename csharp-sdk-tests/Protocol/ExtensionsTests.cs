using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

using Xunit;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S11 — The Extensions Map &amp; Forward Compatibility (§6.5–§6.7) and S38 — The Extension
/// Mechanism (§24), as ported into <see cref="Extensions"/> and <see cref="ExtensionMethodRouter"/>.
/// Mirrors the TypeScript <c>extensions.test.ts</c> and <c>extension-mechanism.test.ts</c> scenarios,
/// including the identifier-grammar edge cases, the bare-token rejection, the prefix-required rule, the
/// normalization that drops null/array entries, activation-by-intersection, the accepted-resultType
/// active set, and the active-set-gated dispatcher.
/// </summary>
public sealed class ExtensionsTests
{
  private static JsonObject Map(string json) => (JsonObject)JsonNode.Parse(json)!;

  // ─── Identifier grammar (R-6.5-a – R-6.5-f) ──────────────────────────────────

  [Fact]
  public void PrefixIsRequired()
  {
    Assert.False(Extensions.IsValidId("/tasks")); // empty prefix
    Assert.Null(Extensions.ParseId("tasks"));      // no slash at all
    Assert.False(Extensions.IsValidId("tasks"));
    Assert.True(Extensions.IsValidId("com.example/tasks"));
  }

  [Theory]
  [InlineData("1com", false)]   // does not start with a letter
  [InlineData("com-", false)]   // does not end with letter/digit
  [InlineData("com", true)]
  [InlineData("ipv6", true)]    // ends in a digit
  [InlineData("a", true)]       // single letter
  [InlineData("my-org", true)]  // interior hyphen
  [InlineData("-org", false)]
  [InlineData("org-", false)]
  [InlineData("com.example", true)]
  [InlineData("org.example.api", true)]
  public void PrefixLabelRules(string prefix, bool valid)
  {
    Assert.Equal(valid, Extensions.IsValidPrefix(prefix));
  }

  [Theory]
  [InlineData("-tasks", false)]
  [InlineData("tasks-", false)]
  [InlineData("oauth-client-credentials", true)]
  [InlineData("", true)] // empty name permitted
  [InlineData("oauth-client_credentials.v2", true)]
  [InlineData("bad name", false)]
  public void NameRules(string name, bool valid)
  {
    Assert.Equal(valid, Extensions.IsValidName(name));
  }

  [Fact]
  public void ParseId_SplitsAtFirstSlash_EmptyNamePermitted()
  {
    var parsed = Extensions.ParseId("com.example/");
    Assert.NotNull(parsed);
    Assert.Equal("com.example", parsed!.Value.Prefix);
    Assert.Equal("", parsed.Value.Name);
    Assert.True(Extensions.IsValidId("com.example/"));
    // A second slash lands inside the name and makes the id invalid.
    Assert.False(Extensions.IsValidId("com.example/a/b"));
  }

  // ─── Reserved prefixes (R-6.5-g) ─────────────────────────────────────────────

  [Theory]
  [InlineData("io.modelcontextprotocol/x")]
  [InlineData("dev.mcp/x")]
  [InlineData("org.modelcontextprotocol.api/x")]
  [InlineData("com.mcp/x")]
  public void ReservedSecondLabel_NotThirdPartyUsableButWellFormed(string id)
  {
    var parsed = Extensions.ParseId(id)!.Value;
    Assert.True(Extensions.IsReservedPrefix(parsed.Prefix));
    Assert.False(Extensions.IsThirdPartyUsable(id));
    Assert.True(Extensions.IsValidId(id)); // reserved identifiers are still well-formed
  }

  [Fact]
  public void ComExampleMcp_IsNotReserved()
  {
    Assert.False(Extensions.IsReservedPrefix("com.example.mcp"));
    Assert.True(Extensions.IsThirdPartyUsable("com.example.mcp/x"));
    // A single-label prefix has no second label, so the second-label rule does not apply.
    Assert.False(Extensions.IsReservedPrefix("mcp"));
  }

  // ─── §24.2 third-party policy incl. bare-token prohibition ───────────────────

  [Fact]
  public void ThirdPartyId_MissingPrefix()
  {
    Assert.False(Extensions.IsValidThirdPartyId("myextension"));
    var v = Extensions.ValidateThirdPartyId("myextension");
    Assert.False(v.Ok);
    Assert.Equal(Extensions.ThirdPartyIdRejection.MissingPrefix, v.Reason);
  }

  [Theory]
  [InlineData("1com.example/x")]
  [InlineData("com.example-/x")]
  [InlineData("com.example/-bad")]
  [InlineData("com.example/bad-")]
  [InlineData("com.example/has space")]
  public void ThirdPartyId_Malformed(string id)
  {
    Assert.False(Extensions.IsValidThirdPartyId(id));
  }

  [Theory]
  [InlineData("io.modelcontextprotocol/x")]
  [InlineData("com.mcp.tools/x")]
  public void ThirdPartyId_ReservedSecondLabel(string id)
  {
    var v = Extensions.ValidateThirdPartyId(id);
    Assert.False(v.Ok);
    Assert.Equal(Extensions.ThirdPartyIdRejection.ReservedPrefix, v.Reason);
  }

  [Theory]
  [InlineData("modelcontextprotocol/x")]
  [InlineData("mcp/x")]
  public void ThirdPartyId_BareReservedToken(string id)
  {
    Assert.True(Extensions.IsReservedBareVendorPrefix(Extensions.ParseId(id)!.Value.Prefix));
    var v = Extensions.ValidateThirdPartyId(id);
    Assert.False(v.Ok);
    // The bare token is caught by the dedicated rule, NOT the second-label rule.
    Assert.Equal(Extensions.ThirdPartyIdRejection.ReservedBareToken, v.Reason);
  }

  [Fact]
  public void ThirdPartyId_AcceptsValidVendorIds()
  {
    Assert.True(Extensions.IsValidThirdPartyId("com.example/x"));
    Assert.True(Extensions.IsValidThirdPartyId("a-b1.example/x"));
    Assert.True(Extensions.IsValidThirdPartyId("com.example.mcp/x")); // second label is example
    Assert.True(Extensions.IsValidThirdPartyId("com.example/my-extension"));
  }

  [Fact]
  public void IdsMatch_IsOctetForOctet_NoCaseFold()
  {
    Assert.False(Extensions.IdsMatch("Com.Example/Ext", "com.example/ext"));
    Assert.True(Extensions.IdsMatch("com.example/ext", "com.example/ext"));
    // The active set is computed without case folding.
    Assert.Empty(Extensions.ComputeActiveSet(Map("""{"Com.Example/Ext":{}}"""), Map("""{"com.example/ext":{}}""")));
  }

  // ─── Settings values & normalization (R-6.5-h/i/j) ───────────────────────────

  [Fact]
  public void EmptyObject_MeansEnabledNotAbsent()
  {
    var raw = Map("""{"io.modelcontextprotocol/tasks":{}}""");
    Assert.True(Extensions.IsAdvertised(raw, "io.modelcontextprotocol/tasks"));
    Assert.NotNull(Extensions.GetSettings(raw, "io.modelcontextprotocol/tasks"));
    Assert.True(Extensions.IsSettings(JsonNode.Parse("{}")));
    var normalized = Extensions.NormalizeMap(raw);
    Assert.True(normalized.ContainsKey("io.modelcontextprotocol/tasks"));
  }

  [Fact]
  public void ProducerMap_HasNoNullValues()
  {
    Assert.True(Extensions.IsValidMap(Map("""{"com.example/a":{},"com.example/b":{"setting":1}}""")));
    Assert.False(Extensions.IsValidMap(Map("""{"com.example/a":null}""")));
  }

  [Fact]
  public void NullEntry_IsMalformed_DroppedAndNotAdvertised()
  {
    var raw = Map("""{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html"]},"io.modelcontextprotocol/broken":null}""");
    var normalized = Extensions.NormalizeMap(raw);
    Assert.False(normalized.ContainsKey("io.modelcontextprotocol/broken"));
    Assert.True(normalized.ContainsKey("io.modelcontextprotocol/ui"));
    Assert.False(Extensions.IsAdvertised(raw, "io.modelcontextprotocol/broken"));
    Assert.Null(Extensions.GetSettings(raw, "io.modelcontextprotocol/broken"));
  }

  [Fact]
  public void NonObjectValues_AreMalformed_Ignored()
  {
    // array / scalar / string values are all dropped.
    var weird = Map("""{"a/b":[],"c/d":42,"e/f":"x"}""");
    Assert.Empty(Extensions.NormalizeMap(weird));
  }

  [Fact]
  public void PickKnownSettings_ProjectsToKnownKeysOnly()
  {
    var settings = Map("""{"mimeTypes":["text/html"],"somethingElse":true,"another":1}""");
    var picked = Extensions.PickKnownSettings(settings, ["mimeTypes"]);
    Assert.True(picked.ContainsKey("mimeTypes"));
    Assert.False(picked.ContainsKey("somethingElse"));
    Assert.False(picked.ContainsKey("another"));
    // An all-unknown projection yields an empty object without error.
    Assert.Empty(Extensions.PickKnownSettings(Map("""{"x":1}"""), ["mimeTypes"]));
  }

  // ─── Activation by intersection (R-6.5-l/m) ──────────────────────────────────

  [Fact]
  public void Intersection_IsActiveOnlyWhenBothAdvertise()
  {
    var client = Map("""{"com.example/E":{},"com.example/onlyClient":{}}""");
    var server = Map("""{"com.example/E":{},"com.example/onlyServer":{}}""");
    Assert.True(Extensions.IsActive("com.example/E", client, server));
    Assert.Equal(["com.example/E"], Extensions.Intersect(client, server));

    Assert.False(Extensions.IsActive("com.example/E", client, Map("{}")));
    Assert.False(Extensions.IsActive("com.example/E", Map("{}"), server));
  }

  [Fact]
  public void DisabledByDefault_EmptyOrAbsentMapAdvertisesNothing()
  {
    Assert.Empty(Extensions.NormalizeMap(Map("{}")));
    Assert.Empty(Extensions.NormalizeMap(null));
    Assert.False(Extensions.IsAdvertised(Map("{}"), "com.example/E"));
    Assert.False(Extensions.IsAdvertised(null, "com.example/E"));
  }

  // ─── One-sided fallback (R-6.5-n) ────────────────────────────────────────────

  [Theory]
  [InlineData(true, false, Extensions.FallbackDecision.UseExtension)]
  [InlineData(true, true, Extensions.FallbackDecision.UseExtension)]
  [InlineData(false, false, Extensions.FallbackDecision.Fallback)]
  [InlineData(false, true, Extensions.FallbackDecision.Reject)]
  public void DecideFallback(bool active, bool mandatory, Extensions.FallbackDecision expected)
  {
    Assert.Equal(expected, Extensions.DecideFallback(active, mandatory));
  }

  // ─── Forward compatibility for capability objects (R-6.6) ────────────────────

  [Fact]
  public void UnknownCapabilityFields_ReportedAndIgnored()
  {
    var caps = Map("""{"tools":{"listChanged":true},"futureFeature":{"anything":true}}""");
    Assert.Equal(["futureFeature"], Extensions.UnknownCapabilityFields(caps, Extensions.KnownServerCapabilityFields));
    var acted = Extensions.IgnoreUnknownCapabilityFields(caps, Extensions.KnownServerCapabilityFields);
    Assert.True(acted.ContainsKey("tools"));
    Assert.False(acted.ContainsKey("futureFeature"));
  }

  [Fact]
  public void IgnoreUnknownFields_LeavesRecognizedViewIdentical()
  {
    var withUnknown = Map("""{"tools":{"listChanged":true},"futureFeature":{"x":true}}""");
    var withoutUnknown = Map("""{"tools":{"listChanged":true}}""");
    var a = Extensions.IgnoreUnknownCapabilityFields(withUnknown, Extensions.KnownServerCapabilityFields);
    var b = Extensions.IgnoreUnknownCapabilityFields(withoutUnknown, Extensions.KnownServerCapabilityFields);
    Assert.True(JsonNode.DeepEquals(a, b));
  }

  // ─── §6.7 worked example ─────────────────────────────────────────────────────

  [Fact]
  public void WorkedExample_ActiveOnlyOnMutualAdvertisement()
  {
    var clientExt = Map("""{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}""");
    var serverExt = Map("""{"io.modelcontextprotocol/tasks":{}}""");

    Assert.False(Extensions.IsActive("io.modelcontextprotocol/ui", clientExt, serverExt));
    Assert.False(Extensions.IsActive("io.modelcontextprotocol/tasks", clientExt, serverExt));
    Assert.Empty(Extensions.Intersect(clientExt, serverExt));

    var serverAlsoUi = Map("""{"io.modelcontextprotocol/tasks":{},"io.modelcontextprotocol/ui":{}}""");
    Assert.True(Extensions.IsActive("io.modelcontextprotocol/ui", clientExt, serverAlsoUi));
    Assert.Equal(["io.modelcontextprotocol/ui"], Extensions.Intersect(clientExt, serverAlsoUi));
  }

  // ─── §24.1 classification & §24.5 surface channels ───────────────────────────

  [Fact]
  public void Classifications_AreModularSpecializedExperimental()
  {
    Assert.Equal(["modular", "specialized", "experimental"], Extensions.ClassificationNames);
    Assert.True(Extensions.IsClassification("modular"));
    Assert.False(Extensions.IsClassification("other"));
  }

  [Fact]
  public void SurfaceChannels_AreExactlyFour()
  {
    Assert.Equal(["method", "meta-key", "result-type", "field"], Extensions.SurfaceChannelNames);
    Assert.True(Extensions.IsSanctionedSurfaceChannel("method"));
    Assert.False(Extensions.IsSanctionedSurfaceChannel("header"));
  }

  // ─── §24.5(1) method namespacing ─────────────────────────────────────────────

  [Fact]
  public void MethodNamespacing()
  {
    Assert.Equal("tasks/", Extensions.DeriveNamespace("io.modelcontextprotocol/tasks"));
    Assert.True(Extensions.IsMethodInNamespace("tasks/get", "io.modelcontextprotocol/tasks"));
    Assert.Equal("tasks/get", Extensions.ExtensionMethod("io.modelcontextprotocol/tasks", "get"));
    Assert.False(Extensions.IsMethodInNamespace("resources/read", "io.modelcontextprotocol/tasks"));
    Assert.False(Extensions.IsMethodInNamespace("tasks/", "io.modelcontextprotocol/tasks")); // empty member
  }

  // ─── §24.5(2) controlled meta keys ───────────────────────────────────────────

  [Fact]
  public void ControlledMetaKeys()
  {
    Assert.True(Extensions.IsExtensionControlledMetaKey("com.example/trace", "com.example/x"));
    Assert.True(Extensions.IsExtensionControlledMetaKey("io.modelcontextprotocol/ui-data", "io.modelcontextprotocol/ui"));
    Assert.False(Extensions.IsExtensionControlledMetaKey("org.other/key", "com.example/x"));
    Assert.False(Extensions.IsExtensionControlledMetaKey("bareKey", "com.example/x"));
    Assert.Equal("com.example/trace", Extensions.ExtensionMetaKey("com.example/x", "trace"));
  }

  // ─── §24.5(3) accepted resultType set ────────────────────────────────────────

  [Fact]
  public void AcceptedResultTypes_AreCorePlusActiveContributions()
  {
    var contributions = new Dictionary<string, IEnumerable<string>>
    {
      ["com.example/x"] = ["com.example.partial"],
      ["com.example/inactive"] = ["com.example.never"],
    };
    var accepted = Extensions.AcceptedResultTypes(["com.example/x"], contributions);
    Assert.Contains(ResultTypes.Complete, accepted);
    Assert.Contains(ResultTypes.InputRequired, accepted);
    Assert.Contains("com.example.partial", accepted);
    Assert.DoesNotContain("com.example.never", accepted); // inactive contributor excluded
    Assert.Equal(["complete", "input_required"], Extensions.CoreResultTypeValues);
  }

  [Fact]
  public void IsResultTypeAccepted()
  {
    Assert.True(Extensions.IsResultTypeAccepted("complete", []));
    Assert.False(Extensions.IsResultTypeAccepted("com.example.partial", []));
    var contributions = new Dictionary<string, IEnumerable<string>> { ["com.example/x"] = ["com.example.partial"] };
    Assert.True(Extensions.IsResultTypeAccepted("com.example.partial", ["com.example/x"], contributions));
    Assert.False(Extensions.IsResultTypeAccepted("com.example.partial", [], contributions));
  }

  // ─── §24.3/§24.4 active set ───────────────────────────────────────────────────

  [Fact]
  public void ComputeActiveSet_AndPerRequestRecomputation()
  {
    Assert.Empty(Extensions.ComputeActiveSet(Map("{}"), Map("{}")));
    Assert.Empty(Extensions.ComputeActiveSet(null, null));

    var client = Map("""{"com.example/a":{},"com.example/b":{},"com.example/c":{}}""");
    var server = Map("""{"com.example/b":{},"com.example/c":{},"com.example/d":{}}""");
    Assert.Equal(["com.example/b", "com.example/c"], Extensions.ComputeActiveSet(client, server));

    var srv = Map("""{"com.example/x":{}}""");
    var a = Extensions.ActiveSetForRequest(Map("""{"com.example/x":{}}"""), srv);
    var b = Extensions.ActiveSetForRequest(Map("{}"), srv); // same connection, different request
    Assert.Equal(["com.example/x"], a);
    Assert.Empty(b); // independent of A — no inference from a prior request
  }

  [Fact]
  public void NullValuedEntry_NotActivatedOnEitherSide()
  {
    Assert.Empty(Extensions.ComputeActiveSet(Map("""{"com.example/broken":null}"""), Map("""{"com.example/broken":{}}""")));
    Assert.Empty(Extensions.ComputeActiveSet(Map("""{"com.example/broken":{}}"""), Map("""{"com.example/broken":null}""")));
  }

  [Fact]
  public void MayEmitSurface_FalseForNonActive()
  {
    var active = Extensions.ComputeActiveSet(Map("""{"com.example/x":{}}"""), Map("""{"com.example/y":{}}"""));
    Assert.False(Extensions.MayEmitSurface("com.example/x", active));
  }

  // ─── §24.6 versioning ─────────────────────────────────────────────────────────

  [Fact]
  public void GetVersion_ReadsFromSettingsObjectOnly()
  {
    Assert.Equal("2", Extensions.GetVersion(Map("""{"com.example/x":{"version":"2"}}"""), "com.example/x"));
    Assert.Equal("2", Extensions.GetVersion(Map("""{"com.example/x":{"version":2}}"""), "com.example/x"));
    Assert.Null(Extensions.GetVersion(Map("""{"com.example/x":{}}"""), "com.example/x"));
    Assert.Null(Extensions.GetVersion(Map("{}"), "com.example/x"));
  }

  [Theory]
  [InlineData(Extensions.ChangeKind.AddOptionalField, false)]
  [InlineData(Extensions.ChangeKind.AddCapabilityFlag, false)]
  [InlineData(Extensions.ChangeKind.RemoveField, true)]
  [InlineData(Extensions.ChangeKind.RenameField, true)]
  [InlineData(Extensions.ChangeKind.ChangeType, true)]
  [InlineData(Extensions.ChangeKind.ChangeSemantics, true)]
  [InlineData(Extensions.ChangeKind.AddRequiredField, true)]
  public void IsIncompatibleChange(Extensions.ChangeKind kind, bool expected)
  {
    Assert.Equal(expected, Extensions.IsIncompatibleChange(kind));
  }

  [Fact]
  public void SuggestSuccessorId()
  {
    Assert.Equal("com.example/my-extension-2", Extensions.SuggestSuccessorId("com.example/my-extension"));
    Assert.Throws<ArgumentException>(() => Extensions.SuggestSuccessorId("not a valid id"));
  }

  // ─── §24.7 graceful degradation ───────────────────────────────────────────────

  [Fact]
  public void BuildRequiredExtensionError_IdentifiesTheExtension()
  {
    var err = Extensions.BuildRequiredExtensionError("com.example/needed");
    Assert.Equal(Extensions.RequiredExtensionAbsentCode, err.Code);
    Assert.Equal(Stackific.Mcp.JsonRpc.ErrorCodes.MissingRequiredClientCapability, err.Code);
    Assert.Equal("com.example/needed", err.RequiredExtension);
    Assert.Contains("com.example/needed", err.Message);
  }

  [Theory]
  [InlineData(true, false, Extensions.FallbackDecision.UseExtension)]
  [InlineData(false, false, Extensions.FallbackDecision.Fallback)]
  [InlineData(false, true, Extensions.FallbackDecision.Reject)]
  public void DecideUse(bool active, bool mandatory, Extensions.FallbackDecision expected)
  {
    var activeSet = active ? new[] { "com.example/x" } : [];
    Assert.Equal(expected, Extensions.DecideUse("com.example/x", activeSet, mandatory));
  }

  // ─── validateExtensionDefinition ─────────────────────────────────────────────

  [Fact]
  public void ValidateDefinition_AcceptsConformingDefinition()
  {
    var result = Extensions.ValidateDefinition(new Extensions.ExtensionDefinition
    {
      Identifier = "com.example/my-extension",
      Classification = "modular",
      Methods = ["my-extension/get"],
      MetaKeys = ["com.example/trace"],
      ResultTypeValues = ["com.example.partial"],
      Fields = ["Tool.x"],
    });
    Assert.True(result.Ok);
  }

  [Fact]
  public void ValidateDefinition_FlagsBadNamespaceCoreResultTypeBadMetaPrefix()
  {
    var result = Extensions.ValidateDefinition(new Extensions.ExtensionDefinition
    {
      Identifier = "com.example/my-extension",
      Methods = ["tasks/get"],     // not under my-extension/
      MetaKeys = ["org.other/key"], // not controlled by com.example
      ResultTypeValues = ["complete"],   // redefines core
    });
    Assert.False(result.Ok);
    var channels = result.Violations.Select(v => v.Channel).ToHashSet();
    Assert.Contains("method", channels);
    Assert.Contains("meta-key", channels);
    Assert.Contains("result-type", channels);
  }

  [Fact]
  public void ValidateDefinition_InvalidIdentifierStopsEarly()
  {
    var result = Extensions.ValidateDefinition(new Extensions.ExtensionDefinition { Identifier = "no-prefix" });
    Assert.False(result.Ok);
    Assert.Single(result.Violations);
    Assert.Equal("identifier", result.Violations[0].Channel);
  }

  // ─── reconcileExtensionSettings ──────────────────────────────────────────────

  [Fact]
  public void ReconcileSettings_ReturnsBothSidesOnlyWhenActive()
  {
    var client = Map("""{"com.example/x":{"mimeTypes":["a","b"]}}""");
    var server = Map("""{"com.example/x":{"mimeTypes":["b","c"]}}""");
    var r = Extensions.ReconcileSettings(client, server, "com.example/x");
    Assert.NotNull(r);
    Assert.True(r!.Value.Client.ContainsKey("mimeTypes"));
    Assert.True(r.Value.Server.ContainsKey("mimeTypes"));
    Assert.Null(Extensions.ReconcileSettings(Map("""{"com.example/x":{}}"""), Map("{}"), "com.example/x"));
  }

  // ─── ExtensionMethodRouter ───────────────────────────────────────────────────

  [Fact]
  public void Router_RefusesInactiveAndUnknownWithCoreCode()
  {
    var router = new ExtensionMethodRouter();
    router.Register("com.example/x", "x/do", _ => "ran");

    var inactive = router.Dispatch("x/do", new JsonObject(), []);
    Assert.False(inactive.Ok);
    Assert.Equal(ExtensionMethodRouter.DispatchRejection.ExtensionInactive, inactive.Reason);
    Assert.Equal(Stackific.Mcp.JsonRpc.ErrorCodes.InvalidParams, inactive.Code);

    var active = router.Dispatch("x/do", new JsonObject(), ["com.example/x"]);
    Assert.True(active.Ok);
    Assert.Equal("ran", active.Result);

    var unknown = router.Dispatch("y/none", new JsonObject(), ["com.example/x"]);
    Assert.False(unknown.Ok);
    Assert.Equal(ExtensionMethodRouter.DispatchRejection.UnknownMethod, unknown.Reason);
  }

  [Fact]
  public void Router_RejectsMisnamedAndDuplicateRegistration()
  {
    var router = new ExtensionMethodRouter();
    Assert.Throws<ArgumentException>(() => router.Register("com.example/x", "rogue/method", _ => 1));
    router.Register("com.example/x", "x/do", _ => 1);
    Assert.Throws<ArgumentException>(() => router.Register("com.example/x", "x/do", _ => 2));
    Assert.True(router.Has("x/do"));
    Assert.Equal("com.example/x", router.OwnerOf("x/do"));
  }
}
