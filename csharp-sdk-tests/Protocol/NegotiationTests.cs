using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.Client;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;
using Stackific.Mcp.Server;
using Stackific.Mcp.Transport;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for revision selection &amp; negotiation errors (spec §5.4–§5.7) and per-request capability
/// negotiation (§6.1–§6.4), mirroring the TypeScript <c>negotiation.test.ts</c> (AC-09.*) and
/// <c>capability-negotiation.test.ts</c> (AC-10.*) suites: highest-mutual revision selection, the
/// no-mutual-revision incompatibility, re-selection after <c>-32004</c>, the §5.7 probe classification
/// and per-endpoint support cache, and the capability gating predicates / graceful degradation.
/// </summary>
public sealed class NegotiationTests
{
  private static JsonObject Caps(string json) => JsonNode.Parse(json)!.AsObject();

  private static JsonNode ResultResponse(string supportedVersionsJson) =>
    JsonNode.Parse(
      "{\"jsonrpc\":\"2.0\",\"id\":0,\"result\":{\"resultType\":\"complete\",\"supportedVersions\":"
      + supportedVersionsJson
      + ",\"capabilities\":{},\"serverInfo\":{\"name\":\"S\",\"version\":\"1\"}}}")!;

  private static JsonNode ErrorResponse(string errorJson) =>
    JsonNode.Parse("{\"jsonrpc\":\"2.0\",\"id\":0,\"error\":" + errorJson + "}")!;

  // ─── AC-09.1 — discovery optional (R-5.4-a) ─────────────────────────────────────────────────────

  // server/discover being OPTIONAL (R-5.4-a) is asserted behaviorally below: re-selection succeeds with
  // no prior discovery, which is only possible if discovery is not a precondition.

  [Fact]
  public void Reselection_works_from_a_rejection_set_with_no_prior_discovery()
  {
    var err = McpError.UnsupportedProtocolVersion(["2026-07-28"], "1900-01-01").ToJsonRpcError();
    var result = RevisionNegotiation.ReselectAfterUnsupportedVersion(err, ["2026-07-28"]);
    Assert.True(result.Ok);
  }

  // ─── AC-09.2 — highest client-preferred, exact match (R-5.4-b) ──────────────────────────────────

  [Fact]
  public void Selects_the_highest_client_preferred_revision()
  {
    var result = RevisionNegotiation.NegotiateRevision(["B", "A"], ["A", "B"]);
    Assert.True(result.Ok);
    Assert.Equal("B", result.SelectedRevision);
  }

  [Fact]
  public void Selection_is_exact_match_not_lexical_or_chronological()
  {
    // "2027-01-01" sorts after "2026-07-28" but is not offered → not chosen.
    var result = RevisionNegotiation.NegotiateRevision(["2027-01-01", "2026-07-28"], ["2026-07-28"]);
    Assert.True(result.Ok);
    Assert.Equal("2026-07-28", result.SelectedRevision);
  }

  [Fact]
  public void Selection_is_independent_of_server_array_order()
  {
    var pref = new[] { "2026-07-28", "2025-03-26" };
    var a = RevisionNegotiation.NegotiateRevision(pref, ["2025-03-26", "2026-07-28"]);
    var b = RevisionNegotiation.NegotiateRevision(pref, ["2026-07-28", "2025-03-26"]);
    Assert.Equal("2026-07-28", a.SelectedRevision);
    Assert.Equal(a.SelectedRevision, b.SelectedRevision);
  }

  [Fact]
  public void SelectRevision_defaults_to_the_current_revision_when_no_preference_is_given()
  {
    Assert.Equal(ProtocolRevision.Current, RevisionNegotiation.SelectRevision(["2025-03-26", ProtocolRevision.Current]));
  }

  [Fact]
  public void SelectRevision_returns_null_when_there_is_no_shared_revision()
  {
    Assert.Null(RevisionNegotiation.SelectRevision(["2026-07-28"], ["1999-01-01"]));
  }

  // ─── AC-09.3 / AC-09.4 — empty intersection (R-5.4-c, R-5.4-d) ──────────────────────────────────

  [Fact]
  public void Empty_intersection_does_not_fabricate_a_revision()
  {
    var result = RevisionNegotiation.NegotiateRevision(["2020-01-01"], ["2026-07-28"]);
    Assert.False(result.Ok);
    Assert.Equal(RevisionNegotiationFailure.NoMutualRevision, result.Reason);
    Assert.Null(result.SelectedRevision);
    Assert.Equal(["2020-01-01"], result.ClientPreference);
    Assert.Equal(["2026-07-28"], result.ServerSupported);
  }

  [Fact]
  public void IncompatibleProtocolError_surfaces_both_sides_for_diagnostics()
  {
    var err = new IncompatibleProtocolError(["2020-01-01"], ["2026-07-28"]);
    Assert.IsAssignableFrom<Exception>(err);
    Assert.Equal("INCOMPATIBLE_PROTOCOL", err.Code);
    Assert.Equal(["2020-01-01"], err.ClientPreference);
    Assert.Equal(["2026-07-28"], err.ServerSupported);
    Assert.Contains("2026-07-28", err.Message);
  }

  // ─── AC-09.5 / AC-09.7 — UnsupportedProtocolVersion shape ───────────────────────────────────────

  [Fact]
  public void UnsupportedProtocolVersion_code_is_minus_32004()
  {
    Assert.Equal(-32004, ErrorCodes.UnsupportedProtocolVersion);
    var err = McpError.UnsupportedProtocolVersion(["2026-07-28"], "1900-01-01").ToJsonRpcError();
    Assert.Equal(-32004, err.Code);
  }

  // ─── AC-09.6 / AC-09.12 — HTTP 400 mapping (R-5.5-b, R-5.6-d) ────────────────────────────────────

  [Fact]
  public void Negotiation_errors_map_to_http_400()
  {
    Assert.Equal(400, RevisionNegotiation.NegotiationErrorHttpStatus);
    Assert.Equal(400, RevisionNegotiation.HttpStatusForNegotiationError(-32004));
    Assert.Equal(400, RevisionNegotiation.HttpStatusForNegotiationError(-32003));
  }

  [Fact]
  public void An_unrelated_code_does_not_map_to_a_negotiation_400()
  {
    Assert.Null(RevisionNegotiation.HttpStatusForNegotiationError(-32601));
  }

  // ─── AC-09.8 — client re-selects and retries (R-5.5-h) ──────────────────────────────────────────

  [Fact]
  public void Client_reselects_from_data_supported()
  {
    var err = McpError.UnsupportedProtocolVersion(["2025-03-26", "2026-07-28"], "1900-01-01").ToJsonRpcError();
    var result = RevisionNegotiation.ReselectAfterUnsupportedVersion(err, ["2026-07-28", "2025-03-26"]);
    Assert.True(result.Ok);
    Assert.Equal("2026-07-28", result.SelectedRevision);
  }

  // ─── AC-09.9 — no mutual revision after rejection (R-5.5-i, R-5.5-j) ─────────────────────────────

  [Fact]
  public void No_mutual_revision_after_rejection_is_terminal()
  {
    var err = McpError.UnsupportedProtocolVersion(["2026-07-28"], "1900-01-01").ToJsonRpcError();
    var result = RevisionNegotiation.ReselectAfterUnsupportedVersion(err, ["2020-01-01"]);
    Assert.False(result.Ok);
    Assert.Equal(RevisionNegotiationFailure.NoMutualRevision, result.Reason);
  }

  [Fact]
  public void Terminal_result_carries_enough_to_build_an_incompatibility()
  {
    var err = McpError.UnsupportedProtocolVersion(["2026-07-28"], "1900-01-01").ToJsonRpcError();
    var result = RevisionNegotiation.ReselectAfterUnsupportedVersion(err, ["2020-01-01"]);
    Assert.False(result.Ok);
    var surfaced = new IncompatibleProtocolError(result.ClientPreference, result.ServerSupported);
    Assert.Equal(["2026-07-28"], surfaced.ServerSupported);
  }

  // ─── AC-09.10 / AC-09.14 — capability satisfaction & augmentation (R-5.6-a/b/i) ──────────────────

  [Fact]
  public void CanSatisfy_is_false_when_a_required_capability_is_not_declared()
  {
    Assert.False(RevisionNegotiation.CanSatisfyRequiredCapabilities(Caps("""{"elicitation":{}}"""), Caps("{}")));
  }

  [Fact]
  public void CanSatisfy_is_true_when_the_client_supports_the_required_capability()
  {
    Assert.True(RevisionNegotiation.CanSatisfyRequiredCapabilities(
      Caps("""{"elicitation":{}}"""), Caps("""{"elicitation":{},"sampling":{}}""")));
  }

  [Fact]
  public void AugmentClientCapabilities_merges_without_mutation()
  {
    var declared = Caps("""{"sampling":{}}""");
    var augmented = RevisionNegotiation.AugmentClientCapabilities(declared, Caps("""{"elicitation":{}}"""));

    Assert.True(augmented.ContainsKey("sampling"));
    Assert.True(augmented.ContainsKey("elicitation"));
    // declared is unchanged.
    Assert.False(declared.ContainsKey("elicitation"));
  }

  // ─── AC-09.15 — probe via server/discover (R-5.7-a, R-5.7-b) ─────────────────────────────────────

  [Fact]
  public void The_probe_method_is_server_discover()
  {
    Assert.Equal("server/discover", RevisionNegotiation.ServerDiscoverMethod);
  }

  [Fact]
  public void A_valid_DiscoverResult_means_supported()
  {
    var outcome = RevisionNegotiation.InterpretProbeResponse(ResultResponse("[\"2026-07-28\"]"));
    var supported = Assert.IsType<ProbeOutcome.Supported>(outcome);
    Assert.Equal(ProbeOutcomeKind.Supported, supported.Kind);
    Assert.Equal(["2026-07-28"], supported.SupportedVersions);
    Assert.NotNull(supported.Result);
  }

  [Fact]
  public void A_recognized_minus_32004_means_unsupported_version()
  {
    var outcome = RevisionNegotiation.InterpretProbeResponse(
      ErrorResponse("""{"code":-32004,"message":"x","data":{"supported":["2026-07-28"],"requested":"1900-01-01"}}"""));
    var unsupported = Assert.IsType<ProbeOutcome.UnsupportedVersion>(outcome);
    Assert.Equal(ProbeOutcomeKind.UnsupportedVersion, unsupported.Kind);
    Assert.Equal(["2026-07-28"], unsupported.SupportedVersions);
    Assert.Equal("1900-01-01", unsupported.Requested);
  }

  // ─── AC-09.16 — unrecognized/malformed/timeout → not-this-protocol (R-5.7-c/d) ──────────────────

  [Fact]
  public void An_unknown_method_error_means_not_this_protocol()
  {
    var outcome = RevisionNegotiation.InterpretProbeResponse(
      ErrorResponse("""{"code":-32601,"message":"Method not found"}"""));
    Assert.Equal(ProbeOutcomeKind.NotThisProtocol, outcome.Kind);
  }

  [Fact]
  public void A_malformed_result_means_not_this_protocol()
  {
    var outcome = RevisionNegotiation.InterpretProbeResponse(
      JsonNode.Parse("""{"jsonrpc":"2.0","id":0,"result":{"foo":"bar"}}"""));
    Assert.Equal(ProbeOutcomeKind.NotThisProtocol, outcome.Kind);
  }

  [Fact]
  public void An_empty_supportedVersions_result_means_not_this_protocol()
  {
    // A DiscoverResult MUST carry a non-empty supportedVersions; [] is not a valid result.
    var outcome = RevisionNegotiation.InterpretProbeResponse(ResultResponse("[]"));
    Assert.Equal(ProbeOutcomeKind.NotThisProtocol, outcome.Kind);
  }

  [Fact]
  public void A_null_response_means_not_this_protocol()
  {
    Assert.Equal(ProbeOutcomeKind.NotThisProtocol, RevisionNegotiation.InterpretProbeResponse(null).Kind);
  }

  // ─── AC-09.17 — cache the determination (R-5.7-e, R-5.7-f) ───────────────────────────────────────

  [Fact]
  public void Cache_records_a_determination_per_endpoint()
  {
    var cache = new ProtocolSupportCache();
    var outcome = RevisionNegotiation.InterpretProbeResponse(ResultResponse("[\"2026-07-28\"]"));
    cache.Set("npx some-server", RevisionNegotiation.DeterminationFromProbe(outcome));

    var determination = cache.Get("npx some-server");
    Assert.NotNull(determination);
    Assert.True(determination!.SpeaksProtocol);
    Assert.Equal(["2026-07-28"], determination.SupportedVersions);
  }

  [Fact]
  public void Cache_persists_via_entries_and_fromEntries()
  {
    var cache = new ProtocolSupportCache();
    cache.Set("e1", ProtocolSupportDetermination.DoesNotSpeak);
    var restored = ProtocolSupportCache.FromEntries(cache.Entries());

    var determination = restored.Get("e1");
    Assert.NotNull(determination);
    Assert.False(determination!.SpeaksProtocol);
  }

  [Fact]
  public void Cache_invalidate_drops_a_cached_assumption()
  {
    var cache = new ProtocolSupportCache();
    cache.Set("e1", ProtocolSupportDetermination.Speaks(["2026-07-28"]));
    cache.Invalidate("e1");
    Assert.False(cache.Has("e1"));
  }

  [Fact]
  public void A_minus_32004_probe_still_counts_as_speaking_the_protocol_family()
  {
    var outcome = RevisionNegotiation.InterpretProbeResponse(
      ErrorResponse("""{"code":-32004,"message":"x","data":{"supported":["2026-07-28"],"requested":"1900-01-01"}}"""));
    var determination = RevisionNegotiation.DeterminationFromProbe(outcome);
    Assert.True(determination.SpeaksProtocol);
    Assert.Equal(["2026-07-28"], determination.SupportedVersions);
  }

  // ─── AC-09.18 — server names supported revisions in any error (R-5.7-g) ──────────────────────────

  [Fact]
  public void Names_supported_revisions_in_an_otherwise_opaque_error()
  {
    var annotated = RevisionNegotiation.NameSupportedRevisionsInError(
      new JsonRpcError(-32600, "Invalid Request"), ["2026-07-28"]);
    Assert.Equal(-32600, annotated.Code);
    var supported = (JsonArray)annotated.Data!.AsObject()["supported"]!;
    Assert.Equal("2026-07-28", supported[0]!.GetValue<string>());
  }

  [Fact]
  public void Names_supported_revisions_preserves_existing_data_fields()
  {
    var baseError = new JsonRpcError(-32600, "x", new JsonObject { ["detail"] = "y" });
    var annotated = RevisionNegotiation.NameSupportedRevisionsInError(baseError, ["2026-07-28"]);
    var data = annotated.Data!.AsObject();
    Assert.Equal("y", data["detail"]!.GetValue<string>());
    Assert.Equal("2026-07-28", ((JsonArray)data["supported"]!)[0]!.GetValue<string>());
    // Input is not mutated.
    Assert.False(baseError.Data!.AsObject().ContainsKey("supported"));
  }

  // ─── AC-10.x — capability gating predicates (capability-negotiation.ts) ─────────────────────────

  [Fact]
  public void ClientDeclares_reads_only_the_supplied_object()
  {
    Assert.True(CapabilityNegotiation.ClientDeclares(Caps("""{"elicitation":{}}"""), "elicitation"));
    Assert.False(CapabilityNegotiation.ClientDeclares(Caps("{}"), "elicitation"));
  }

  [Fact]
  public void Elicitation_form_is_the_implicit_baseline()
  {
    Assert.True(CapabilityNegotiation.ClientDeclares(Caps("""{"elicitation":{}}"""), "elicitation.form"));
    Assert.True(CapabilityNegotiation.ClientDeclares(Caps("""{"elicitation":{"form":{}}}"""), "elicitation.form"));
    Assert.False(CapabilityNegotiation.ClientDeclares(Caps("{}"), "elicitation.form"));
  }

  [Fact]
  public void No_inference_of_one_capability_from_another()
  {
    var caps = Caps("""{"sampling":{}}""");
    Assert.True(CapabilityNegotiation.ClientDeclares(caps, "sampling"));
    Assert.False(CapabilityNegotiation.ClientDeclares(caps, "elicitation"));
  }

  [Theory]
  [InlineData("""{"elicitation":{}}""", false)]
  [InlineData("""{"elicitation":{"form":{}}}""", false)]
  [InlineData("""{"elicitation":{"url":{}}}""", true)]
  public void Url_mode_elicitation_requires_the_url_sub_flag(string capsJson, bool expected)
  {
    Assert.Equal(expected, CapabilityNegotiation.MayUseUrlElicitation(Caps(capsJson)));
  }

  [Fact]
  public void Deprecated_roots_gates_roots_list()
  {
    Assert.True(CapabilityNegotiation.MayInvokeRootsList(Caps("""{"roots":{}}""")));
    Assert.False(CapabilityNegotiation.MayInvokeRootsList(Caps("{}")));
    Assert.True(CapabilityNegotiation.IsDeprecatedClientCapability("roots"));
  }

  [Fact]
  public void Deprecated_sampling_gates_sampling_createMessage()
  {
    Assert.True(CapabilityNegotiation.MayInvokeSampling(Caps("""{"sampling":{}}""")));
    Assert.False(CapabilityNegotiation.MayInvokeSampling(Caps("{}")));
    Assert.True(CapabilityNegotiation.IsDeprecatedClientCapability("sampling"));
  }

  // ─── AC-10.12 — sampling.context gates includeContext (R-6.2-n, R-6.2-o) ────────────────────────

  [Theory]
  [InlineData("""{"sampling":{}}""", null, true)]
  [InlineData("""{"sampling":{}}""", "none", true)]
  [InlineData("""{"sampling":{}}""", "thisServer", false)]
  [InlineData("""{"sampling":{}}""", "allServers", false)]
  [InlineData("""{"sampling":{"context":{}}}""", "allServers", true)]
  public void Sampling_context_gates_includeContext(string capsJson, string? value, bool expected)
  {
    Assert.Equal(expected, CapabilityNegotiation.MayUseIncludeContext(Caps(capsJson), value));
  }

  // ─── AC-10.13 — sampling.tools gates tools/toolChoice (R-6.2-p, R-6.2-q) ────────────────────────

  [Theory]
  [InlineData("""{"sampling":{}}""", false)]
  [InlineData("""{"sampling":{"tools":{}}}""", true)]
  public void Sampling_tools_gates_sampling_tool_use(string capsJson, bool expected)
  {
    Assert.Equal(expected, CapabilityNegotiation.MayUseSamplingTools(Caps(capsJson)));
  }

  // ─── AC-10.15 / AC-10.23 — method gating (R-6.3-d/e, R-6.4-f/g) ─────────────────────────────────

  [Fact]
  public void Completions_gates_completion_complete()
  {
    Assert.Equal("completions", CapabilityNegotiation.ServerMethodRequiredCapability("completion/complete"));
    Assert.False(CapabilityNegotiation.MayClientInvoke("completion/complete", Caps("{}")));
    Assert.True(CapabilityNegotiation.MayClientInvoke("completion/complete", Caps("""{"completions":{}}""")));
  }

  [Fact]
  public void MayClientInvoke_gates_a_method_behind_an_undeclared_capability()
  {
    Assert.False(CapabilityNegotiation.MayClientInvoke("tools/call", Caps("{}")));
    Assert.True(CapabilityNegotiation.MayClientInvoke("tools/call", Caps("""{"tools":{}}""")));
    Assert.False(CapabilityNegotiation.MayClientInvoke("resources/read", Caps("""{"tools":{}}""")));
  }

  [Fact]
  public void Declaring_a_capability_means_prepared_for_its_non_sub_flag_operations()
  {
    var caps = Caps("""{"tools":{}}""");
    Assert.True(CapabilityNegotiation.MayClientInvoke("tools/list", caps));
    Assert.True(CapabilityNegotiation.MayClientInvoke("tools/call", caps));
  }

  // ─── AC-10.16 to AC-10.19 — notification gating (R-6.3-f..q) ────────────────────────────────────

  [Theory]
  [InlineData("notifications/prompts/list_changed", """{"prompts":{"listChanged":true}}""", true)]
  [InlineData("notifications/prompts/list_changed", """{"prompts":{}}""", false)]
  [InlineData("notifications/prompts/list_changed", """{"prompts":{"listChanged":false}}""", false)]
  [InlineData("notifications/resources/updated", """{"resources":{"subscribe":true}}""", true)]
  [InlineData("notifications/resources/updated", """{"resources":{}}""", false)]
  [InlineData("notifications/resources/list_changed", """{"resources":{"listChanged":true}}""", true)]
  [InlineData("notifications/resources/list_changed", """{"resources":{"subscribe":true}}""", false)]
  [InlineData("notifications/tools/list_changed", """{"tools":{"listChanged":true}}""", true)]
  [InlineData("notifications/tools/list_changed", """{"tools":{}}""", false)]
  [InlineData("notifications/message", """{"logging":{}}""", true)]
  [InlineData("notifications/message", "{}", false)]
  public void ClientShouldExpectNotification_respects_the_gating_sub_flag(string notification, string capsJson, bool expected)
  {
    Assert.Equal(expected, CapabilityNegotiation.ClientShouldExpectNotification(notification, Caps(capsJson)));
  }

  [Fact]
  public void NotificationRequiredCapability_maps_tools_list_changed()
  {
    Assert.Equal("tools.listChanged", CapabilityNegotiation.NotificationRequiredCapability("notifications/tools/list_changed"));
  }

  [Fact]
  public void Logging_is_a_deprecated_server_capability()
  {
    Assert.True(CapabilityNegotiation.IsDeprecatedServerCapability("logging"));
  }

  // ─── AC-10.24 — missing cap → -32003 + 400 (R-6.4-h, R-6.4-i) ───────────────────────────────────

  [Fact]
  public void GateRequiredClientCapabilities_allows_when_all_required_are_declared()
  {
    // A null result means the request is allowed (no blocking error).
    Assert.Null(CapabilityNegotiation.GateRequiredClientCapabilities(
      Caps("""{"elicitation":{}}"""), Caps("""{"elicitation":{}}""")));
  }

  [Fact]
  public void GateRequiredClientCapabilities_rejects_with_minus_32003_listing_the_missing_subset()
  {
    var error = CapabilityNegotiation.GateRequiredClientCapabilities(
      Caps("""{"sampling":{}}"""), Caps("""{"elicitation":{}}"""));
    Assert.NotNull(error);
    Assert.Equal(-32003, error!.Code);
    var required = error.Data!.AsObject()["requiredCapabilities"]!.AsObject();
    Assert.True(required.ContainsKey("elicitation"));
    Assert.False(required.ContainsKey("sampling"));
  }

  [Fact]
  public void ComputeMissingClientCapabilities_returns_only_the_undeclared_subset()
  {
    var missing = CapabilityNegotiation.ComputeMissingClientCapabilities(
      Caps("""{"elicitation":{}}"""), Caps("""{"elicitation":{},"sampling":{}}"""));
    Assert.True(missing.ContainsKey("sampling"));
    Assert.False(missing.ContainsKey("elicitation"));
  }

  [Fact]
  public void Capability_errors_map_to_http_400()
  {
    Assert.Equal(400, CapabilityNegotiation.CapabilityErrorHttpStatus);
    Assert.Equal(400, CapabilityNegotiation.HttpStatusForCapabilityError(-32003));
    Assert.Equal(400, CapabilityNegotiation.HttpStatusForCapabilityError(-32602));
    Assert.Null(CapabilityNegotiation.HttpStatusForCapabilityError(-32601));
  }

  // ─── AC-10.26 — graceful degradation (R-6.4-l, R-6.4-m) ─────────────────────────────────────────

  [Theory]
  [InlineData(true, true, DegradationDecision.Proceed)]
  [InlineData(false, false, DegradationDecision.Fallback)]
  [InlineData(false, true, DegradationDecision.Reject)]
  [InlineData(true, false, DegradationDecision.Proceed)]
  public void DecideDegradation_never_rejects_merely_for_fewer_capabilities(
    bool peerDeclares, bool mandatory, DegradationDecision expected)
  {
    Assert.Equal(expected, CapabilityNegotiation.DecideDegradation(peerDeclares, mandatory));
  }

  // ─── Server sub-flag "true-only" declaration semantics (R-6.3-h/l/o) ────────────────────────────

  [Theory]
  [InlineData("""{"tools":{"listChanged":true}}""", true)]
  [InlineData("""{"tools":{"listChanged":false}}""", false)]
  [InlineData("""{"tools":{}}""", false)]
  public void ServerDeclares_tools_listChanged_is_true_only(string capsJson, bool expected)
  {
    Assert.Equal(expected, CapabilityNegotiation.ServerDeclares(Caps(capsJson), "tools.listChanged"));
  }

  [Fact]
  public void ServerDeclares_base_capability_stands_without_the_sub_flag()
  {
    var caps = Caps("""{"tools":{}}""");
    Assert.True(CapabilityNegotiation.ServerDeclares(caps, "tools"));
    Assert.False(CapabilityNegotiation.ServerDeclares(caps, "tools.listChanged"));
  }

  // ───────────────────────── S45-RC-1: client -32004 reselect-and-retry (R-29.3-c) ─────────────────────────

  /// <summary>
  /// A handler that answers the FIRST request with <c>-32004</c> (UnsupportedProtocolVersion) carrying the
  /// supplied <c>data.supported</c>, then succeeds on every subsequent request — to exercise the client's
  /// reselect-and-retry path end to end.
  /// </summary>
  private sealed class UnsupportedThenOkHandler(IReadOnlyList<string> supported) : IMcpRequestHandler
  {
    public int Calls { get; private set; }

    public Task<JsonRpcMessage> HandleRequestAsync(JsonRpcRequest request, IServerNotifier notifier, AuthInfo? authInfo, CancellationToken cancellationToken)
    {
      Calls++;
      if (Calls == 1)
      {
        var error = McpError.UnsupportedProtocolVersion(supported, "rejected-version").ToJsonRpcError();
        return Task.FromResult<JsonRpcMessage>(new JsonRpcErrorResponse(request.Id, error));
      }
      return Task.FromResult<JsonRpcMessage>(new JsonRpcSuccessResponse(request.Id, new JsonObject { ["resultType"] = "complete", ["ok"] = true }));
    }

    public Task HandleNotificationAsync(JsonRpcNotification notification, CancellationToken cancellationToken) => Task.CompletedTask;
  }

  [Fact]
  public async Task Client_retries_once_after_minus_32004_when_data_supported_overlaps()
  {
    // §5.5 / R-29.3-c: -32004 with an overlapping data.supported → reselect and retry exactly once; succeed.
    var handler = new UnsupportedThenOkHandler(ProtocolRevision.Supported);
    await using var client = new McpClient(new InMemoryClientTransport(handler), new Implementation { Name = "c", Version = "1" });

    var result = await client.RequestAsync(McpMethods.Ping);

    Assert.True(result["ok"]!.GetValue<bool>());
    Assert.Equal(2, handler.Calls); // first rejected, retried once, succeeded.
  }

  [Fact]
  public async Task Client_throws_incompatible_protocol_when_minus_32004_has_no_overlap()
  {
    // No mutual revision in data.supported → terminal: surface IncompatibleProtocolError, do NOT loop.
    var handler = new UnsupportedThenOkHandler(["1999-01-01"]);
    await using var client = new McpClient(new InMemoryClientTransport(handler), new Implementation { Name = "c", Version = "1" });

    await Assert.ThrowsAsync<IncompatibleProtocolError>(() => client.RequestAsync(McpMethods.Ping));
    Assert.Equal(1, handler.Calls); // rejected once, never retried.
  }
}
