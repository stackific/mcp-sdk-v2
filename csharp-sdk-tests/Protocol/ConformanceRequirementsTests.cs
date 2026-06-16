using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

using Xunit;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S45 — Conformance Requirements &amp; References (§29–§30), as ported into
/// <see cref="ConformanceRequirements"/>. Mirrors the TypeScript <c>conformance-requirements.test.ts</c>
/// scenarios: the requirement registry and level classifier, the profile descriptor + validator, the
/// ordered §29.2 baseline-server disposition, the capability→obligation map, the robustness disposition,
/// the stateless invariants, the transport-conformance evaluator, and the §30 citation status.
/// </summary>
public sealed class ConformanceRequirementsTests
{
  private static readonly IReadOnlyList<string> Supported = [ProtocolRevision.Current];

  /// <summary>Builds a well-formed §4 client request <c>_meta</c> envelope.</summary>
  private static JsonObject BaselineMeta() => new()
  {
    ["io.modelcontextprotocol/protocolVersion"] = ProtocolRevision.Current,
    ["io.modelcontextprotocol/clientInfo"] = new JsonObject { ["name"] = "c", ["version"] = "1.0.0" },
    ["io.modelcontextprotocol/clientCapabilities"] = new JsonObject(),
  };

  // ─── Registry, axes, levels ──────────────────────────────────────────────────

  [Fact]
  public void EveryRequirementLevel_MatchesTheCanonicalFamilyForItsKeyword()
  {
    foreach (var r in ConformanceRequirements.All)
    {
      Assert.Equal(ConformanceRequirements.RequirementKeywords[r.Keyword], r.Level);
      Assert.Contains(r.Level, ConformanceRequirements.RequirementLevels);
    }
  }

  [Fact]
  public void Registry_HasNoDuplicateIds_AndKnownAnchorAtoms()
  {
    var ids = ConformanceRequirements.All.Select(r => r.Id).ToList();
    Assert.Equal(ids.Count, ids.Distinct().Count());
    Assert.Equal("29.2", ConformanceRequirements.Lookup("R-29.2-h")?.Section);
    Assert.Null(ConformanceRequirements.Lookup("R-99.9-z"));
  }

  [Fact]
  public void Axes_AreThreeInOrder_AndEveryRequirementUsesOne()
  {
    Assert.Equal(
      [ConformanceRequirements.Axis.Role, ConformanceRequirements.Axis.Feature, ConformanceRequirements.Axis.Transport],
      ConformanceRequirements.Axes);
    foreach (var r in ConformanceRequirements.All)
    {
      Assert.Contains(r.Axis, ConformanceRequirements.Axes);
    }
  }

  [Fact]
  public void ForAxis_And_ForRole_PartitionCorrectly()
  {
    var transportReqs = ConformanceRequirements.ForAxis(ConformanceRequirements.Axis.Transport);
    Assert.Contains(transportReqs, r => r.Id == "R-29.8-a");
    Assert.All(transportReqs, r => Assert.Equal(ConformanceRequirements.Axis.Transport, r.Axis));

    var serverReqs = ConformanceRequirements.ForRole(ConformanceRequirements.Role.Server).Select(r => r.Id).ToList();
    Assert.Contains("R-29.2-a", serverReqs);     // server-only
    Assert.DoesNotContain("R-29.3-a", serverReqs); // client-only
    Assert.Contains("R-29.1-c", serverReqs);     // empty roles ⇒ binds the server too
  }

  // ─── RFC 2119 classifier ─────────────────────────────────────────────────────

  [Theory]
  [InlineData("MUST")]
  [InlineData("MUST NOT")]
  [InlineData("REQUIRED")]
  [InlineData("SHALL")]
  [InlineData("SHALL NOT")]
  public void ClassifiesTheMustFamily(string keyword)
  {
    Assert.Equal(ConformanceRequirements.Level.Must, ConformanceRequirements.ClassifyRequirementLevel(keyword));
    Assert.True(ConformanceRequirements.IsMandatoryKeyword(keyword));
    Assert.False(ConformanceRequirements.IsAdvisoryKeyword(keyword));
    Assert.False(ConformanceRequirements.IsOptionalKeyword(keyword));
  }

  [Theory]
  [InlineData("SHOULD")]
  [InlineData("SHOULD NOT")]
  [InlineData("RECOMMENDED")]
  public void ClassifiesTheShouldFamily(string keyword)
  {
    Assert.Equal(ConformanceRequirements.Level.Should, ConformanceRequirements.ClassifyRequirementLevel(keyword));
    Assert.True(ConformanceRequirements.IsAdvisoryKeyword(keyword));
  }

  [Theory]
  [InlineData("MAY")]
  [InlineData("OPTIONAL")]
  public void ClassifiesTheMayFamily(string keyword)
  {
    Assert.Equal(ConformanceRequirements.Level.May, ConformanceRequirements.ClassifyRequirementLevel(keyword));
    Assert.True(ConformanceRequirements.IsOptionalKeyword(keyword));
  }

  [Fact]
  public void UnknownKeyword_ReturnsNullWithoutThrowing()
  {
    Assert.Null(ConformanceRequirements.ClassifyRequirementLevel("WIBBLE"));
    Assert.False(ConformanceRequirements.IsMandatoryKeyword("WIBBLE"));
  }

  // ─── Profile + requirementsForProfile ────────────────────────────────────────

  [Fact]
  public void SatisfiesRole_BothRoleMustSatisfyEach()
  {
    Assert.True(ConformanceRequirements.SatisfiesRole([ConformanceRequirements.Role.Client, ConformanceRequirements.Role.Server], ConformanceRequirements.Role.Client));
    Assert.True(ConformanceRequirements.SatisfiesRole([ConformanceRequirements.Role.Client, ConformanceRequirements.Role.Server], ConformanceRequirements.Role.Server));
    Assert.False(ConformanceRequirements.SatisfiesRole([ConformanceRequirements.Role.Server], ConformanceRequirements.Role.Client));
    Assert.False(ConformanceRequirements.SatisfiesRole([ConformanceRequirements.Role.Client], ConformanceRequirements.Role.Server));
  }

  [Fact]
  public void RequirementsForProfile_IncludesBothRolesBaseline()
  {
    var profile = new ConformanceRequirements.ConformanceProfile
    {
      Roles = [ConformanceRequirements.Role.Client, ConformanceRequirements.Role.Server],
      Revisions = Supported,
      Capabilities = [],
      Extensions = [],
      Transports = ["stdio"],
    };
    var ids = ConformanceRequirements.RequirementsForProfile(profile).Select(r => r.Id).ToList();
    Assert.Contains("R-29.2-a", ids); // server baseline
    Assert.Contains("R-29.3-a", ids); // client baseline
  }

  [Fact]
  public void RequirementsForProfile_CapabilityAtomOnlyWhenAdvertised()
  {
    var withTools = new ConformanceRequirements.ConformanceProfile
    {
      Roles = [ConformanceRequirements.Role.Server],
      Revisions = Supported,
      Capabilities = ["tools"],
      Extensions = [],
      Transports = ["stdio"],
    };
    var without = withTools with { Capabilities = [] };
    Assert.Contains("R-29.4-b", ConformanceRequirements.RequirementsForProfile(withTools).Select(r => r.Id));
    Assert.DoesNotContain("R-29.4-b", ConformanceRequirements.RequirementsForProfile(without).Select(r => r.Id));
  }

  [Fact]
  public void ValidateConformanceProfile_AcceptsZeroExtensionAndFlagsViolations()
  {
    var good = new ConformanceRequirements.ConformanceProfile
    {
      Roles = [ConformanceRequirements.Role.Server],
      Revisions = Supported,
      Capabilities = [],
      Extensions = [],
      Transports = ["stdio"],
    };
    Assert.True(ConformanceRequirements.ValidateConformanceProfile(good).Ok);

    var bad = good with { Extensions = ["not a valid id"] };
    var v1 = ConformanceRequirements.ValidateConformanceProfile(bad);
    Assert.False(v1.Ok);
    Assert.Contains(v1.Violations, x => x.Field == "extensions");

    var noTransport = good with { Transports = [] };
    var v2 = ConformanceRequirements.ValidateConformanceProfile(noTransport);
    Assert.False(v2.Ok);
    Assert.Contains(v2.Violations, x => x.Field == "transports");

    var missingWire = good with { Revisions = ["2025-01-01"] };
    var v3 = ConformanceRequirements.ValidateConformanceProfile(missingWire);
    Assert.False(v3.Ok);
    Assert.Contains(v3.Violations, x => x.Field == "revisions");
  }

  [Fact]
  public void ProfileSupportsRevision()
  {
    var profile = new ConformanceRequirements.ConformanceProfile
    {
      Roles = [ConformanceRequirements.Role.Server],
      Revisions = Supported,
      Capabilities = [],
      Extensions = [],
      Transports = ["stdio"],
    };
    Assert.True(ConformanceRequirements.ProfileSupportsRevision(profile, ProtocolRevision.Current));
  }

  // ─── classifyServerRequest (ordered §29.2 disposition) ───────────────────────

  [Fact]
  public void ClassifyServerRequest_AcceptsAWellFormedEnvelope()
  {
    var disp = ConformanceRequirements.ClassifyServerRequest(BaselineMeta(), Supported);
    Assert.True(disp.Ok);
    Assert.Equal(ConformanceRequirements.ServerRequestStage.Accepted, disp.Stage);
  }

  [Fact]
  public void ClassifyServerRequest_JudgesEachRequestOnItsOwnEnvelope()
  {
    Assert.True(ConformanceRequirements.ClassifyServerRequest(BaselineMeta(), Supported).Ok);
    // A second request that omits a field is rejected on its own merits, never reused from the first.
    var second = BaselineMeta();
    second.Remove("io.modelcontextprotocol/clientCapabilities");
    var disp = ConformanceRequirements.ClassifyServerRequest(second, Supported);
    Assert.False(disp.Ok);
    Assert.Equal(ConformanceRequirements.ServerRequestStage.Envelope, disp.Stage);
  }

  [Fact]
  public void ClassifyServerRequest_UnsupportedRevisionIs32004()
  {
    var meta = BaselineMeta();
    meta["io.modelcontextprotocol/protocolVersion"] = "2025-01-01";
    var disp = ConformanceRequirements.ClassifyServerRequest(meta, Supported);
    Assert.False(disp.Ok);
    Assert.Equal(ConformanceRequirements.ServerRequestStage.Revision, disp.Stage);
    Assert.Equal(ErrorCodes.UnsupportedProtocolVersion, disp.Code);
    Assert.Equal(Supported, disp.Supported);
    Assert.Equal("2025-01-01", disp.Requested);
  }

  [Fact]
  public void ClassifyServerRequest_MalformedVersionIsEnvelopeFailure()
  {
    var meta = BaselineMeta();
    meta["io.modelcontextprotocol/protocolVersion"] = "not-a-date";
    var disp = ConformanceRequirements.ClassifyServerRequest(meta, Supported);
    Assert.False(disp.Ok);
    Assert.Equal(ConformanceRequirements.ServerRequestStage.Envelope, disp.Stage);
  }

  [Fact]
  public void ClassifyServerRequest_OmittedRequiredFieldIs32602()
  {
    var meta = BaselineMeta();
    meta.Remove("io.modelcontextprotocol/clientInfo");
    var disp = ConformanceRequirements.ClassifyServerRequest(meta, Supported);
    Assert.False(disp.Ok);
    Assert.Equal(ConformanceRequirements.ServerRequestStage.Envelope, disp.Stage);
    Assert.Equal(ErrorCodes.InvalidParams, disp.Code);
  }

  [Fact]
  public void ClassifyServerRequest_UndeclaredRequiredCapabilityIs32003()
  {
    var required = new JsonObject { ["elicitation"] = new JsonObject() };
    var disp = ConformanceRequirements.ClassifyServerRequest(BaselineMeta(), Supported, required);
    Assert.False(disp.Ok);
    Assert.Equal(ConformanceRequirements.ServerRequestStage.Capability, disp.Stage);
    Assert.Equal(ErrorCodes.MissingRequiredClientCapability, disp.Code);
    Assert.NotNull(disp.RequiredCapabilities);
    Assert.True(disp.RequiredCapabilities!.ContainsKey("elicitation"));
  }

  [Fact]
  public void ClassifyServerRequest_AcceptsWhenRequiredCapabilityIsDeclared()
  {
    var meta = BaselineMeta();
    meta["io.modelcontextprotocol/clientCapabilities"] = new JsonObject { ["elicitation"] = new JsonObject() };
    var required = new JsonObject { ["elicitation"] = new JsonObject() };
    Assert.True(ConformanceRequirements.ClassifyServerRequest(meta, Supported, required).Ok);
  }

  [Fact]
  public void ClassifyServerRequest_RefusesUnadvertisedFeature()
  {
    var disp = ConformanceRequirements.ClassifyServerRequest(BaselineMeta(), Supported, featureAdvertised: false);
    Assert.False(disp.Ok);
    Assert.Equal(ConformanceRequirements.ServerRequestStage.Gating, disp.Stage);

    Assert.True(ConformanceRequirements.ClassifyServerRequest(BaselineMeta(), Supported, featureAdvertised: true).Ok);
  }

  // ─── validateSuccessResultType ────────────────────────────────────────────────

  [Fact]
  public void ValidateSuccessResultType_AcceptsCore_RejectsMissingAndNonAdvertised()
  {
    Assert.True(ConformanceRequirements.ValidateSuccessResultType(new JsonObject { ["resultType"] = "complete" }).Ok);
    Assert.True(ConformanceRequirements.ValidateSuccessResultType(new JsonObject { ["resultType"] = "input_required" }).Ok);

    var missing = ConformanceRequirements.ValidateSuccessResultType(new JsonObject { ["content"] = new JsonArray() });
    Assert.False(missing.Ok);
    Assert.Equal(ConformanceRequirements.ResultTypeFailure.Missing, missing.Reason);

    var contributions = new Dictionary<string, IEnumerable<string>> { ["com.example/ext"] = ["streamed"] };
    var notAdvertised = ConformanceRequirements.ValidateSuccessResultType(new JsonObject { ["resultType"] = "streamed" }, [], contributions);
    Assert.False(notAdvertised.Ok);
    Assert.Equal(ConformanceRequirements.ResultTypeFailure.NotAdvertised, notAdvertised.Reason);
    Assert.True(ConformanceRequirements.ValidateSuccessResultType(new JsonObject { ["resultType"] = "streamed" }, ["com.example/ext"], contributions).Ok);
  }

  // ─── baseline client envelope + retry ────────────────────────────────────────

  [Fact]
  public void ClientBaselineEnvelope_AndRequiredKeys()
  {
    Assert.True(ConformanceRequirements.ClientRequestCarriesBaselineEnvelope(BaselineMeta()));
    Assert.Equal(
      ["io.modelcontextprotocol/protocolVersion", "io.modelcontextprotocol/clientInfo", "io.modelcontextprotocol/clientCapabilities"],
      ConformanceRequirements.RequiredClientRequestMetaKeys);

    foreach (var key in ConformanceRequirements.RequiredClientRequestMetaKeys)
    {
      var meta = BaselineMeta();
      meta.Remove(key);
      Assert.False(ConformanceRequirements.ClientRequestCarriesBaselineEnvelope(meta));
    }
  }

  [Fact]
  public void ValidateInputRequiredRetry_AllRules()
  {
    Assert.True(ConformanceRequirements.ValidateInputRequiredRetry("req-3", "req-3-retry", "OPAQUE", "OPAQUE").Ok);

    var reused = ConformanceRequirements.ValidateInputRequiredRetry(7, 7);
    Assert.False(reused.Ok);
    Assert.Equal(ConformanceRequirements.RetryFailure.ReusedId, reused.Reason);

    var mismatch = ConformanceRequirements.ValidateInputRequiredRetry("a", "b", "X", "Y");
    Assert.False(mismatch.Ok);
    Assert.Equal(ConformanceRequirements.RetryFailure.StateMismatch, mismatch.Reason);

    var unexpected = ConformanceRequirements.ValidateInputRequiredRetry("a", "b", retryState: "X");
    Assert.False(unexpected.Ok);
    Assert.Equal(ConformanceRequirements.RetryFailure.UnexpectedState, unexpected.Reason);

    Assert.True(ConformanceRequirements.ValidateInputRequiredRetry("a", "b").Ok);
  }

  // ─── capability obligations ───────────────────────────────────────────────────

  [Fact]
  public void CapabilityObligations_MapToFeatureSections()
  {
    Assert.Equal("16", ConformanceRequirements.ObligationForCapability("tools")?.Section);
    Assert.Equal("17", ConformanceRequirements.ObligationForCapability("resources")?.Section);
    Assert.Equal("18", ConformanceRequirements.ObligationForCapability("prompts")?.Section);
    Assert.Equal("19", ConformanceRequirements.ObligationForCapability("completions")?.Section);
    Assert.Equal("20", ConformanceRequirements.ObligationForCapability("elicitation")?.Section);

    var sub = ConformanceRequirements.ObligationForCapability("resources.subscribe");
    Assert.Equal("17", sub?.Section);
    Assert.Contains("10", sub!.AdditionalSections);

    Assert.Equal(ConformanceRequirements.Role.Client, ConformanceRequirements.ObligationForCapability("elicitation")?.Party);
    Assert.Equal(ConformanceRequirements.Role.Server, ConformanceRequirements.ObligationForCapability("tools")?.Party);
  }

  [Fact]
  public void ObligedSections_AggregateAndDeduplicate()
  {
    Assert.Equal(["10", "16", "17", "19"],
      ConformanceRequirements.ObligedSectionsForCapabilities(["tools", "resources.subscribe", "completions"]));
  }

  // ─── no unsolicited input requests ───────────────────────────────────────────

  [Fact]
  public void MayPlaceInputRequest_GatedByDeclaredCapability()
  {
    Assert.False(ConformanceRequirements.MayPlaceInputRequest("elicitation/create", new JsonObject()));
    Assert.True(ConformanceRequirements.MayPlaceInputRequest("elicitation/create", new JsonObject { ["elicitation"] = new JsonObject() }));
    Assert.Equal("elicitation", ConformanceRequirements.InputRequestRequiredCapability["elicitation/create"]);
    Assert.Equal("roots", ConformanceRequirements.InputRequestRequiredCapability["roots/list"]);
    Assert.Equal("sampling", ConformanceRequirements.InputRequestRequiredCapability["sampling/createMessage"]);
    Assert.False(ConformanceRequirements.MayPlaceInputRequest("unknown/kind", new JsonObject { ["unknown"] = new JsonObject() }));
  }

  // ─── robustness ──────────────────────────────────────────────────────────────

  [Theory]
  [InlineData(ConformanceRequirements.RobustnessElement.Field, ConformanceRequirements.RobustnessDispositionKind.Ignore)]
  [InlineData(ConformanceRequirements.RobustnessElement.Capability, ConformanceRequirements.RobustnessDispositionKind.Ignore)]
  [InlineData(ConformanceRequirements.RobustnessElement.Extension, ConformanceRequirements.RobustnessDispositionKind.Ignore)]
  [InlineData(ConformanceRequirements.RobustnessElement.ResultType, ConformanceRequirements.RobustnessDispositionKind.TreatAsError)]
  [InlineData(ConformanceRequirements.RobustnessElement.ErrorCode, ConformanceRequirements.RobustnessDispositionKind.FailRequest)]
  public void RobustnessDisposition_ForUnrecognized(
    ConformanceRequirements.RobustnessElement element, ConformanceRequirements.RobustnessDispositionKind expected)
  {
    Assert.Equal(expected, ConformanceRequirements.RobustnessDisposition(element, false));
  }

  [Fact]
  public void RobustnessDisposition_RecognizedAlwaysAccepts()
  {
    Assert.Equal(ConformanceRequirements.RobustnessDispositionKind.Accept,
      ConformanceRequirements.RobustnessDisposition(ConformanceRequirements.RobustnessElement.Field, true));
    Assert.Equal(ConformanceRequirements.RobustnessDispositionKind.Accept,
      ConformanceRequirements.RobustnessDisposition(ConformanceRequirements.RobustnessElement.ResultType, true));
  }

  [Fact]
  public void DecideResultAction_CoreAbsentAndUnrecognized()
  {
    var core = ConformanceRequirements.DecideResultAction(new JsonObject { ["resultType"] = "complete" });
    Assert.True(core.Act);
    Assert.Equal("complete", core.ResultType);

    // Absent discriminator → §3 absence rule → complete.
    var absent = ConformanceRequirements.DecideResultAction(new JsonObject { ["content"] = new JsonArray() });
    Assert.True(absent.Act);
    Assert.Equal("complete", absent.ResultType);

    var unknown = ConformanceRequirements.DecideResultAction(new JsonObject { ["resultType"] = "wibble" });
    Assert.False(unknown.Act);
    Assert.True(unknown.Unrecognized);
    Assert.Equal("wibble", unknown.ResultType);

    var contributions = new Dictionary<string, IEnumerable<string>> { ["com.example/ext"] = ["streamed"] };
    var active = ConformanceRequirements.DecideResultAction(new JsonObject { ["resultType"] = "streamed" }, ["com.example/ext"], contributions);
    Assert.True(active.Act);
    Assert.Equal("streamed", active.ResultType);
  }

  // ─── stateless invariants ────────────────────────────────────────────────────

  [Fact]
  public void StatelessInvariants_AreAllTrue()
  {
    var inv = ConformanceRequirements.StatelessInvariants;
    Assert.True(inv.IndependentRequests);
    Assert.True(inv.ExplicitCrossRequestState);
    Assert.True(inv.ConnectionIsNotLifetimeBoundary);
    Assert.True(inv.RequestStateIsUntrusted);
    Assert.True(inv.RequestStateIntegrityProtected);
  }

  [Fact]
  public void DecideRequestStateHandling()
  {
    var rejected = ConformanceRequirements.DecideRequestStateHandling(true, false);
    Assert.Equal(ConformanceRequirements.RequestStateTrust.Untrusted, rejected.Trust);
    Assert.True(rejected.Reject);

    Assert.False(ConformanceRequirements.DecideRequestStateHandling(true, true).Reject);
    Assert.False(ConformanceRequirements.DecideRequestStateHandling(false, false).Reject);
  }

  // ─── transport conformance ────────────────────────────────────────────────────

  [Fact]
  public void StreamableHttpStatusForProtocolError()
  {
    Assert.Equal(400, ConformanceRequirements.StreamableHttpStatusForProtocolError(ErrorCodes.InvalidParams));
    Assert.Equal(400, ConformanceRequirements.StreamableHttpStatusForProtocolError(ErrorCodes.MissingRequiredClientCapability));
    Assert.Null(ConformanceRequirements.StreamableHttpStatusForProtocolError(ErrorCodes.MethodNotFound));
  }

  [Fact]
  public void EvaluateTransportConformance_HttpAndStdio()
  {
    var http = ConformanceRequirements.EvaluateTransportConformance("streamable-http");
    Assert.True(http.AuthorizationApplies);
    Assert.False(http.AuthorizationForbidden);
    Assert.Equal(ConformanceRequirements.TransportCredentialConveyance.Bearer, http.CredentialConveyance);

    var stdio = ConformanceRequirements.EvaluateTransportConformance("stdio");
    Assert.False(stdio.AuthorizationApplies);
    Assert.True(stdio.AuthorizationForbidden);
    Assert.Equal(ConformanceRequirements.TransportCredentialConveyance.Environment, stdio.CredentialConveyance);
  }

  // ─── no partial conformance + citations ───────────────────────────────────────

  [Fact]
  public void IsFeatureFullyConformant()
  {
    var partial = ConformanceRequirements.IsFeatureFullyConformant(true, false);
    Assert.False(partial.Ok);
    Assert.True(partial.AdvertisedNotImplemented);

    Assert.True(ConformanceRequirements.IsFeatureFullyConformant(true, true).Ok);
    Assert.True(ConformanceRequirements.IsFeatureFullyConformant(false, false).Ok);
  }

  [Fact]
  public void Citations_AreProvenanceOnly()
  {
    Assert.False(ConformanceRequirements.CitationStatus.LoadBearing);
    Assert.True(ConformanceRequirements.CitationStatus.SelfContained);
    Assert.False(ConformanceRequirements.IsCitationLoadBearing("[MCP-Versioning]"));
    Assert.False(ConformanceRequirements.IsCitationLoadBearing("anything-at-all"));
  }

  // ─── spot-checks of specific atom keywords (mirrors the AC keyword assertions) ─

  [Theory]
  [InlineData("R-29.1-e", "MUST NOT")]
  [InlineData("R-29.1-f", "MAY")]
  [InlineData("R-29.2-a", "MUST")]
  [InlineData("R-29.2-b", "MAY")]
  [InlineData("R-29.5-a", "OPTIONAL")]
  [InlineData("R-29.8-d", "SHOULD")]
  [InlineData("R-29.8-e", "SHOULD NOT")]
  [InlineData("R-30-a", "MAY")]
  public void AtomKeywords_AreReproducedVerbatim(string id, string keyword)
  {
    Assert.Equal(keyword, ConformanceRequirements.Lookup(id)?.Keyword);
  }
}
