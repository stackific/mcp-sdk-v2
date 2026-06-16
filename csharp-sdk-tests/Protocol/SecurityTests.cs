using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

using Xunit;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S44 — Security Considerations (§28), as ported into <see cref="Security"/>,
/// <see cref="ContinuationTokenStore{TState}"/>, and <see cref="ToolCallRateLimiter"/>. Mirrors the
/// TypeScript <c>security.test.ts</c> scenarios: the §28 registry, the consent gate, trust
/// classification and tool-safety predicates, token handling, continuation-token integrity/replay,
/// elicitation/sampling/UI consent, metadata/observability, and input validation &amp; resource bounds.
/// </summary>
public sealed class SecurityTests
{
  private static SamplingObligationsFull FullSampling() => new();

  /// <summary>A fully-satisfied sampling-obligations helper that mirrors the TS test fixture.</summary>
  private readonly record struct SamplingObligationsFull
  {
    public Security.SamplingConsentObligations Value => new(true, true, true, true, true);
  }

  // ─── AC-44.1 — registry + four core principles ───────────────────────────────

  [Fact]
  public void Principles_AreTheFourCorePrinciples()
  {
    Assert.Equal(["user-consent-and-control", "data-privacy", "tool-safety", "host-mediated-trust"], Security.Principles);
  }

  [Fact]
  public void Registry_RegistersEveryAtomAndIndexesById()
  {
    Assert.True(Security.Requirements.Count > 70);
    var ids = Security.Requirements.Select(r => r.Id).ToList();
    Assert.Equal(ids.Count, ids.Distinct().Count());
    foreach (var id in new[] { "R-28-a", "R-28.1-a", "R-28.5-b", "R-28.10-p" })
    {
      Assert.Contains(id, ids);
    }
    Assert.Equal("MUST", Security.LookupRequirement("R-28.5-b")?.Level);
    Assert.Equal("§28.5", Security.LookupRequirement("R-28.5-b")?.Section);
    Assert.Null(Security.LookupRequirement("R-99-z"));
  }

  [Fact]
  public void EveryRequirement_MapsToOneOfTheFourPrinciples()
  {
    var principles = new HashSet<string>(Security.Principles);
    foreach (var r in Security.Requirements)
    {
      Assert.Contains(r.Principle, principles);
    }
    Assert.NotEmpty(Security.RequirementsForPrinciple("tool-safety"));
  }

  [Fact]
  public void MandatoryRequirements_AreOnlyMustOrMustNot()
  {
    Assert.All(Security.MandatoryRequirements(), r => Assert.True(r.Level is "MUST" or "MUST NOT"));
  }

  [Fact]
  public void AssessBaseline_PassesOnlyWhenAllFourClaimed()
  {
    Assert.True(Security.AssessBaseline(new Security.SecurityBaselineClaims(true, true, true, true)).Ok);
    var partial = Security.AssessBaseline(new Security.SecurityBaselineClaims(true, false, true, false));
    Assert.False(partial.Ok);
    Assert.Equal(["data-privacy", "host-mediated-trust"], partial.UnmetPrinciples);
  }

  // ─── AC-44.2 / AC-44.7 — consent gate ────────────────────────────────────────

  [Fact]
  public void Consent_DeniesSilence()
  {
    var d = Security.EvaluateConsent(new Security.ConsentRequest("tool:send_email", "to=alice"));
    Assert.False(d.Allowed);
    Assert.Equal(Security.ConsentReason.NoConsent, d.Reason);
  }

  [Fact]
  public void Consent_FreshApprovalRecordsReusableGrant()
  {
    var req = new Security.ConsentRequest("tool:send_email", "to=alice", true);
    Assert.True(Security.EvaluateConsent(req).Allowed);
    var grant = Security.RecordConsentGrant(req);
    Assert.Equal(new Security.ConsentGrant("tool:send_email", "to=alice", true), grant);
    var again = Security.EvaluateConsent(new Security.ConsentRequest("tool:send_email", "to=alice"), grant);
    Assert.True(again.Allowed);
    Assert.Equal(Security.ConsentReason.MatchesPriorGrant, again.Reason);
  }

  [Fact]
  public void Consent_MaterialChangeRefusesSilentEscalation()
  {
    var prior = new Security.ConsentGrant("tool:send_email", "to=alice", true);
    var d = Security.EvaluateConsent(new Security.ConsentRequest("tool:send_email", "to=attacker"), prior);
    Assert.False(d.Allowed);
    Assert.Equal(Security.ConsentReason.SilentEscalation, d.Reason);
    var approved = Security.EvaluateConsent(new Security.ConsentRequest("tool:send_email", "to=attacker", true), prior);
    Assert.True(approved.Allowed);
  }

  // ─── AC-44.3 / AC-44.4 ───────────────────────────────────────────────────────

  [Fact]
  public void DataExposure_RequiresConsent()
  {
    Assert.False(Security.AssertConsentedDataExposure("file:///secret.txt").Ok);
    var grant = new Security.ConsentGrant("resource-exposure", "file:///secret.txt", true);
    Assert.True(Security.AssertConsentedDataExposure("file:///secret.txt", grant).Ok);
  }

  [Fact]
  public void AccessControls_MustBeCommensurateWithSensitivity()
  {
    Assert.True(Security.AccessControlsAreCommensurate(Security.DataSensitivity.Confidential, Security.DataSensitivity.Confidential));
    Assert.True(Security.AccessControlsAreCommensurate(Security.DataSensitivity.Confidential, Security.DataSensitivity.Secret));
    Assert.False(Security.AccessControlsAreCommensurate(Security.DataSensitivity.Secret, Security.DataSensitivity.Confidential));
    Assert.True(Security.AccessControlsAreCommensurate(Security.DataSensitivity.Public, Security.DataSensitivity.Public));
  }

  // ─── AC-44.5 / AC-44.6 / AC-44.8 — tool safety ───────────────────────────────

  [Fact]
  public void ToolTrust_AnnotationsAndHumanInTheLoop()
  {
    Assert.Equal(Security.InputTrust.Untrusted, Security.ClassifyToolDefinitionTrust(false));
    Assert.Equal(Security.InputTrust.Trusted, Security.ClassifyToolDefinitionTrust(true));
    Assert.False(Security.ToolAnnotationIsSecurityGuarantee());
    Assert.True(Security.MayDisplayToolAnnotations(true));
    Assert.False(Security.MayDisplayToolAnnotations(false));

    Assert.False(Security.AssertHumanInTheLoop(true, modelDecidedAlone: true).Ok);
    Assert.False(Security.AssertHumanInTheLoop(false, modelDecidedAlone: false).Ok);
    Assert.True(Security.AssertHumanInTheLoop(true, modelDecidedAlone: false).Ok);
  }

  // ─── AC-44.9 — rate limiting + output sanitization ───────────────────────────

  [Fact]
  public void RateLimiter_RejectsCallsBeyondTheLimit()
  {
    long t = 0;
    var limiter = new ToolCallRateLimiter(2, 1000, () => t);
    Assert.True(limiter.Check("client-a").Allowed);
    Assert.True(limiter.Check("client-a").Allowed);
    var third = limiter.Check("client-a");
    Assert.False(third.Allowed);
    Assert.True(third.RetryAfterMs > 0);
    // A different client has its own independent window.
    Assert.True(limiter.Check("client-b").Allowed);
    // After the window elapses, the first client is allowed again.
    t = 1001;
    Assert.True(limiter.Check("client-a").Allowed);
  }

  [Fact]
  public void RateLimiter_RejectsInvalidConfiguration()
  {
    Assert.Throws<ArgumentOutOfRangeException>(() => new ToolCallRateLimiter(0, 1000));
    Assert.Throws<ArgumentOutOfRangeException>(() => new ToolCallRateLimiter(1, 0));
  }

  [Fact]
  public void BuildRateLimitRejection_MatchesWireExample()
  {
    var err = Security.BuildRateLimitRejection(1000);
    Assert.Equal(Security.RateLimitRejectionCode, err.Code);
    Assert.Equal(-32600, err.Code);
    Assert.Equal(1000, err.RetryAfterMs);
    Assert.Null(Security.BuildRateLimitRejection().RetryAfterMs);
  }

  [Fact]
  public void SanitizeToolOutput_StripsControlSequencesKeepsWhitespace()
  {
    // ESC (\u001b) opens an ANSI sequence; BEL (\u0007) and NUL (\u0000) are smuggled controls;
    // \t and \n are ordinary whitespace and MUST be kept.
    var malicious = "ok\u001b[31mRED\u0007\u0000 text\twith\nnewlines";
    Assert.True(Security.ToolOutputHasControlSequences(malicious));
    var clean = Security.SanitizeToolOutputText(malicious);
    Assert.Equal("ok[31mRED text\twith\nnewlines", clean);
    Assert.False(Security.ToolOutputHasControlSequences(clean));
    // Idempotent on already-clean text.
    Assert.Equal("plain text\n", Security.SanitizeToolOutputText("plain text\n"));
  }

  // ─── AC-44.10 — redaction ────────────────────────────────────────────────────

  [Fact]
  public void RedactForLogging_RedactsCredentials()
  {
    var logged = (JsonObject)Security.RedactForLogging(new JsonObject
    {
      ["tool"] = "send_email",
      ["arguments"] = new JsonObject { ["to"] = "alice", ["authorization"] = "Bearer abc" },
      ["access_token"] = "xyz",
    })!;
    var args = (JsonObject)logged["arguments"]!;
    Assert.Equal(Security.RedactedPlaceholder, (string?)args["authorization"]);
    Assert.Equal("alice", (string?)args["to"]);
    Assert.Equal(Security.RedactedPlaceholder, (string?)logged["access_token"]);
  }

  [Fact]
  public void RedactForLogging_WalksNestedArraysAndObjects()
  {
    var redacted = (JsonObject)Security.RedactForLogging(new JsonObject
    {
      ["meta"] = new JsonObject { ["traceparent"] = "00-abc", ["cookie"] = "session=1" },
      ["list"] = new JsonArray(new JsonObject { ["token"] = "t" }, "plain"),
    })!;
    var meta = (JsonObject)redacted["meta"]!;
    Assert.Equal("00-abc", (string?)meta["traceparent"]);
    Assert.Equal(Security.RedactedPlaceholder, (string?)meta["cookie"]);
    var list = (JsonArray)redacted["list"]!;
    Assert.Equal(Security.RedactedPlaceholder, (string?)((JsonObject)list[0]!)["token"]);
    Assert.Equal("plain", (string?)list[1]);
  }

  // ─── AC-44.11 — server isolation ─────────────────────────────────────────────

  [Fact]
  public void ServerIsolation()
  {
    Assert.False(Security.AssertServerIsolation("server-b", hostElected: true, sourceServerId: "server-a").Ok);
    Assert.False(Security.AssertServerIsolation("server-b", hostElected: false).Ok);
    Assert.True(Security.AssertServerIsolation("server-a", hostElected: true, sourceServerId: "server-a").Ok);
  }

  // ─── AC-44.12 / AC-44.13 / AC-44.14 / AC-44.17 — auth security ────────────────

  [Fact]
  public void ServerAccessToken_AudienceBoundValidatedBeforeUse()
  {
    var notValidated = Security.ValidateServerAccessToken(["https://mcp.example.com"], "https://mcp.example.com", false);
    Assert.False(notValidated.Ok);
    Assert.Equal(-32600, notValidated.Code);

    var mismatch = Security.ValidateServerAccessToken(["https://other.example.com"], "https://mcp.example.com", true);
    Assert.False(mismatch.Ok);
    Assert.Contains("not valid for this resource", mismatch.Reason);

    Assert.True(Security.ValidateServerAccessToken(["https://mcp.example.com"], "https://mcp.example.com", true).Ok);
  }

  [Fact]
  public void NoTokenPassthrough()
  {
    Assert.False(Security.AssertNoTokenPassthrough("client-token", "client-token", "https://up.example.com", "https://up.example.com").Ok);
    Assert.False(Security.AssertNoTokenPassthrough("client-token", "separate-token", "https://wrong.example.com", "https://up.example.com").Ok);
    Assert.True(Security.AssertNoTokenPassthrough("client-token", "separate-token", "https://up.example.com", "https://up.example.com").Ok);
  }

  [Fact]
  public void ExactIssuerValidation()
  {
    Assert.False(Security.ValidateAuthorizationIssuer("https://as.example.com", "https://evil.example.com").Ok);
    Assert.True(Security.ValidateAuthorizationIssuer("https://as.example.com", "https://as.example.com").Ok);
  }

  [Fact]
  public void TokenTransportSecurity()
  {
    Assert.False(Security.AssertTokenTransportSecurity(["https://as.example.com/token"], tokenLogged: true, tokenForwarded: false).Ok);
    Assert.False(Security.AssertTokenTransportSecurity(["https://as.example.com/token"], tokenLogged: false, tokenForwarded: true).Ok);
    Assert.False(Security.AssertTokenTransportSecurity(["http://as.example.com/token"], tokenLogged: false, tokenForwarded: false).Ok);

    var ok = Security.AssertTokenTransportSecurity(
      ["https://as.example.com/token"], tokenLogged: false, tokenForwarded: false,
      redirectUris: ["http://localhost:8080/cb", "https://app.example.com/cb"]);
    Assert.True(ok.Ok);

    Assert.False(Security.AssertTokenTransportSecurity(
      ["https://as.example.com/token"], tokenLogged: false, tokenForwarded: false,
      redirectUris: ["http://app.example.com/cb"]).Ok);
  }

  // ─── AC-44.18 — continuation-token integrity/replay ──────────────────────────

  [Fact]
  public void ContinuationToken_IntegrityProtection()
  {
    var store = new ContinuationTokenStore<JsonObject>();
    var issued = store.Issue(new JsonObject { ["step"] = 1 }, integrityTag: "sig-123");
    var bad = store.Validate(issued.Value, "sig-WRONG");
    Assert.False(bad.Ok);
    Assert.Equal(Security.ContinuationTokenFailure.IntegrityFailure, bad.Reason);
    var good = store.Validate(issued.Value, "sig-123");
    Assert.True(good.Ok);
    Assert.Equal(1, (int)good.State!["step"]!);
  }

  [Fact]
  public void ContinuationToken_UnknownIsRejected()
  {
    var store = new ContinuationTokenStore<int>();
    var r = store.Validate("never-issued");
    Assert.False(r.Ok);
    Assert.Equal(Security.ContinuationTokenFailure.Unknown, r.Reason);
  }

  [Fact]
  public void ContinuationToken_ReplayAndExpiry()
  {
    long t = 0;
    var store = new ContinuationTokenStore<int>(() => t);
    var issued = store.Issue(42, ttlMs: 100);
    Assert.True(store.Validate(issued.Value).Ok);
    // Single-use re-use is refused.
    var replay = store.Validate(issued.Value);
    Assert.False(replay.Ok);
    Assert.Equal(Security.ContinuationTokenFailure.Replayed, replay.Reason);
    // A fresh, expired token is refused too.
    var issued2 = store.Issue(43, ttlMs: 100);
    t = 200;
    var expired = store.Validate(issued2.Value);
    Assert.False(expired.Ok);
    Assert.Equal(Security.ContinuationTokenFailure.Expired, expired.Reason);
  }

  // ─── AC-44.19 — elicitation under user control ───────────────────────────────

  [Fact]
  public void Elicitation_UnderUserControl()
  {
    Assert.False(Security.AssertElicitationUnderUserControl(Security.ElicitationUserDecision.Approve, userCouldReview: false, serverIdentityShown: true).Ok);
    Assert.True(Security.AssertElicitationUnderUserControl(Security.ElicitationUserDecision.Cancel, userCouldReview: true, serverIdentityShown: false).Ok);
    Assert.False(Security.AssertElicitationUnderUserControl(Security.ElicitationUserDecision.Approve, userCouldReview: true, serverIdentityShown: false).Ok);

    var phishing = Security.AssertElicitationUnderUserControl(
      Security.ElicitationUserDecision.Approve, userCouldReview: true, serverIdentityShown: true,
      requestedSchema: (JsonObject)JsonNode.Parse("""{"properties":{"password":{"type":"string","title":"Your password"}}}""")!);
    Assert.False(phishing.Ok);
    Assert.Contains("phish", phishing.Reason);

    var safe = Security.AssertElicitationUnderUserControl(
      Security.ElicitationUserDecision.Approve, userCouldReview: true, serverIdentityShown: true,
      requestedSchema: (JsonObject)JsonNode.Parse("""{"properties":{"city":{"type":"string"}}}""")!);
    Assert.True(safe.Ok);
  }

  // ─── AC-44.20 — sampling human review ────────────────────────────────────────

  [Fact]
  public void Sampling_UnderUserControl()
  {
    var full = FullSampling().Value;
    var unmet = full with { HumanInTheLoop = false };
    Assert.False(Security.AssertSamplingUnderUserControl(unmet, true, true, true).Ok);
    Assert.False(Security.AssertSamplingUnderUserControl(full, true, false, true).Ok);
    Assert.False(Security.AssertSamplingUnderUserControl(full, true, true, false).Ok);
    Assert.True(Security.AssertSamplingUnderUserControl(full, true, true, true).Ok);
  }

  // ─── AC-44.21 / AC-44.22 — UI sandbox + mediated tools/call ───────────────────

  [Fact]
  public void UiSandbox_Conforming()
  {
    var denied = new[] { "dom", "cookies", "storage", "navigation" };
    Assert.False(Security.AssertUiSandboxConforming(denied, restrictiveCspApplied: false, new JsonObject()).Ok);
    Assert.False(Security.AssertUiSandboxConforming(["dom", "cookies"], restrictiveCspApplied: true, new JsonObject()).Ok);
    Assert.False(Security.AssertUiSandboxConforming(denied, restrictiveCspApplied: true, new JsonObject { ["accessToken"] = "secret" }).Ok);
    Assert.True(Security.AssertUiSandboxConforming(denied, restrictiveCspApplied: true,
      new JsonObject { ["toolInput"] = new JsonObject(), ["toolResult"] = new JsonObject(), ["hostContext"] = new JsonObject() }).Ok);
  }

  [Fact]
  public void UiToolCall_RoutesOnlyWithVisibilityConsentAndPolicy()
  {
    var appVisible = new[] { "app" };
    Assert.True(Security.MediateUiInitiatedToolCall(new Security.ToolsCallMediationInput(appVisible, true, true)).Route);
    Assert.False(Security.MediateUiInitiatedToolCall(new Security.ToolsCallMediationInput(appVisible, false, true)).Route);
    Assert.False(Security.MediateUiInitiatedToolCall(new Security.ToolsCallMediationInput(appVisible, true, false)).Route);
  }

  // ─── AC-44.23 — metadata authority / sanitize / redact ───────────────────────

  [Fact]
  public void Metadata_NeverAuthority_AndSanitized()
  {
    Assert.False(Security.MetadataConveysAuthority());
    var sanitized = Security.SanitizeConsumedMetadata(
      new JsonObject { ["traceparent"] = "00-abc", ["injected"] = "evil" }, ["traceparent", "missing"]);
    Assert.True(sanitized.ContainsKey("traceparent"));
    Assert.False(sanitized.ContainsKey("injected"));
    Assert.Empty(Security.SanitizeConsumedMetadata(JsonValue.Create("not-an-object"), ["x"]));
  }

  // ─── AC-44.24 — validate tool args/results ───────────────────────────────────

  [Fact]
  public void ValidatePeerToolCall_ReportsInvalidArgsAsError()
  {
    var tool = new Security.ToolSchemas(
      (JsonObject)JsonNode.Parse("""{"type":"object","properties":{"location":{"type":"string"}},"required":["location"]}""")!);
    var r = Security.ValidatePeerToolCall(tool, JsonNode.Parse("""{"location":42}"""));
    Assert.False(r.Ok);
    Assert.Equal(-32602, r.Code);
    Assert.NotEmpty(r.Errors);
  }

  [Fact]
  public void ValidatePeerToolCall_ValidatesStructuredResults_AndAcceptsValidArgs()
  {
    var tool = new Security.ToolSchemas(
      (JsonObject)JsonNode.Parse("""{"type":"object","properties":{}}""")!,
      (JsonObject)JsonNode.Parse("""{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}""")!);
    Assert.False(Security.ValidatePeerToolCall(tool, JsonNode.Parse("{}"), JsonNode.Parse("""{"ok":"yes"}""")).Ok);
    Assert.True(Security.ValidatePeerToolCall(tool, JsonNode.Parse("{}"), JsonNode.Parse("""{"ok":true}""")).Ok);

    var simple = new Security.ToolSchemas((JsonObject)JsonNode.Parse("""{"type":"object","properties":{"location":{"type":"string"}}}""")!);
    Assert.True(Security.ValidatePeerToolCall(simple, JsonNode.Parse("""{"location":"SF"}""")).Ok);
  }

  // ─── AC-44.25 / AC-44.26 / AC-44.27 — URI / Origin / cursor ───────────────────

  [Fact]
  public void ResourceUriAccess_AndSsrf()
  {
    Assert.False(Security.ValidateResourceUriAccess("not a uri", _ => true).Ok);
    Assert.False(Security.ValidateResourceUriAccess("https://example.com/x", _ => false).Ok);

    Assert.False(Security.ValidateResourceUriAccess("http://127.0.0.1/admin", _ => true, guardSsrf: true).Ok);
    Assert.False(Security.ValidateResourceUriAccess("http://169.254.169.254/latest", _ => true, guardSsrf: true).Ok);
    Assert.False(Security.ValidateResourceUriAccess("http://10.0.0.5/x", _ => true, guardSsrf: true).Ok);
    Assert.False(Security.ValidateResourceUriAccess("http://localhost/x", _ => true, guardSsrf: true).Ok);
    Assert.True(Security.ValidateResourceUriAccess("https://example.com/x", _ => true, guardSsrf: true).Ok);
  }

  [Fact]
  public void RequestOrigin()
  {
    var accepted = new[] { "https://app.example.com" };
    var rejected = Security.ValidateRequestOrigin("https://evil.example.com", accepted);
    Assert.False(rejected.Accepted);
    Assert.Equal("https://evil.example.com", rejected.Origin);
    Assert.True(Security.ValidateRequestOrigin("https://app.example.com", accepted).Accepted);
    Assert.True(Security.ValidateRequestOrigin(null, accepted).Accepted);
  }

  [Fact]
  public void PaginationCursor()
  {
    var rejected = Security.ValidatePaginationCursor("attacker-controlled", _ => false);
    Assert.False(rejected.Ok);
    Assert.Equal(-32602, rejected.Error!.Value.Code);

    var ok = Security.ValidatePaginationCursor("page-2", _ => true);
    Assert.True(ok.Ok);
    Assert.Equal("page-2", ok.Cursor);

    var first = Security.ValidatePaginationCursor(null, _ => true);
    Assert.True(first.Ok);
    Assert.Null(first.Cursor);
  }

  // ─── AC-44.28 / AC-44.29 / AC-44.30 — bounds / refs / file path ───────────────

  [Fact]
  public void EnforceInputBounds()
  {
    JsonNode deep = JsonNode.Parse("""{"type":"string"}""")!;
    for (var i = 0; i < 10; i++)
    {
      deep = new JsonObject { ["type"] = "object", ["properties"] = new JsonObject { ["nested"] = deep } };
    }
    Assert.False(Security.EnforceInputBounds(deep, bounds: new Security.InputBounds(4, 1024)).Ok);

    var big = new string('x', 2000);
    Assert.False(Security.EnforceInputBounds(serializedPayload: big, bounds: new Security.InputBounds(64, 1000)).Ok);

    Assert.True(Security.DefaultInputBounds.MaxSchemaDepth > 0);
    Assert.True(Security.EnforceInputBounds(JsonNode.Parse("""{"type":"object","properties":{}}"""), serializedPayload: "{}").Ok);
  }

  [Fact]
  public void SelfContainedSchema()
  {
    var external = JsonNode.Parse("""{"type":"object","properties":{"x":{"$ref":"https://evil.example.com/schema.json"}}}""");
    Assert.False(Security.AssertSelfContainedSchema(external).Ok);

    var inDocument = JsonNode.Parse("""{"type":"object","$defs":{"x":{"type":"string"}},"properties":{"y":{"$ref":"#/$defs/x"}}}""");
    Assert.True(Security.AssertSelfContainedSchema(inDocument).Ok);

    var trusted = JsonNode.Parse("""{"properties":{"x":{"$ref":"https://trusted.example.com/s.json"}}}""");
    Assert.True(Security.AssertSelfContainedSchema(trusted, allowTrustedExternalRefs: true).Ok);
  }

  [Fact]
  public void FilePathSanitization()
  {
    Assert.False(Security.SanitizeFilePath("../../etc/passwd", "/srv/data").Ok);
    Assert.False(Security.SanitizeFilePath("/etc/passwd", "/srv/data").Ok);

    var within = Security.SanitizeFilePath("sub/./file.txt", "/srv/data");
    Assert.True(within.Ok);
    Assert.Equal("/srv/data/sub/file.txt", within.ResolvedPath);

    var backInside = Security.SanitizeFilePath("a/../b/file.txt", "/srv/data");
    Assert.True(backInside.Ok);
    Assert.Equal("/srv/data/b/file.txt", backInside.ResolvedPath);

    Assert.False(Security.SanitizeFilePath("file\0.txt", "/srv/data").Ok);
  }
}
