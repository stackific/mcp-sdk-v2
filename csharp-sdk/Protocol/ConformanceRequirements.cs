using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

using Stackific.Mcp.Json;
using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// S45 — Conformance Requirements &amp; References (spec §29–§30).
/// </summary>
/// <remarks>
/// <para>
/// The formal conformance contract: the precise, testable definition of what it means for an MCP
/// implementation to be conformant, decomposed along the three independent axes of §29.1 — role
/// (client/server/both), feature surface (baseline plus advertised), and transport (each implemented
/// transport, independently). It restates, as a single machine-checkable rulebook, the baseline
/// obligations of every server and client (§29.2, §29.3), the bidirectional advertise⇔implement
/// principle (§29.4, §29.5), the robustness rules for richer-than-understood inputs (§29.6), the
/// stateless-model invariants (§29.7), the transport obligations (§29.8), the conformance method
/// (§29.9), and the provenance-only status of the §30 reference markers.
/// </para>
/// <para>
/// This defines NO new wire types. Its artifacts are the requirement registry
/// (<see cref="ConformanceRequirements.All"/>), the RFC 2119 keyword classifier
/// (<see cref="ConformanceRequirements.ClassifyRequirementLevel"/>), the
/// <see cref="ConformanceProfile"/> descriptor and its validator, the baseline server
/// request-disposition predicate (<see cref="ConformanceRequirements.ClassifyServerRequest"/>), the
/// capability→obligation map, the robustness disposition, the stateless invariants, the
/// transport-conformance evaluator, and the §30 citation status.
/// </para>
/// </remarks>
public static partial class ConformanceRequirements
{
  // ─── §29.1 — The three conformance axes ─────────────────────────────────────────

  /// <summary>A role an implementation plays (spec §29.1, R-29.1-a, R-29.1-b).</summary>
  public enum Role
  {
    /// <summary>The client role.</summary>
    Client,

    /// <summary>The server role.</summary>
    Server,
  }

  /// <summary>
  /// The three independent axes along which conformance is scoped (spec §29.1). Conformance is the
  /// product of these: an implementation is conformant iff every applicable requirement on its chosen
  /// roles, advertised features, and implemented transports is satisfied.
  /// </summary>
  public enum Axis
  {
    /// <summary>Role axis: client / server / both (§29.1 item 1).</summary>
    Role,

    /// <summary>Feature axis: baseline plus advertised capabilities/extensions (§29.1 item 2).</summary>
    Feature,

    /// <summary>Transport axis: each transport, independently (§29.1 item 3).</summary>
    Transport,
  }

  /// <summary>The three conformance axes, in spec order (§29.1).</summary>
  public static IReadOnlyList<Axis> Axes { get; } = [Axis.Role, Axis.Feature, Axis.Transport];

  // ─── §2 / RFC 2119 — Requirement-level classifier ───────────────────────────────

  /// <summary>
  /// A normative requirement level in the RFC 2119 / RFC 8174 sense (spec §2). The <c>MUST</c> family
  /// also covers MUST NOT / REQUIRED / SHALL / SHALL NOT; <c>SHOULD</c> also covers SHOULD NOT /
  /// RECOMMENDED; <c>MAY</c> also covers OPTIONAL.
  /// </summary>
  public enum Level
  {
    /// <summary>An unconditional, absolute requirement (MUST family).</summary>
    Must,

    /// <summary>An advisory requirement (SHOULD family).</summary>
    Should,

    /// <summary>A truly discretionary requirement (MAY / OPTIONAL).</summary>
    May,
  }

  /// <summary>
  /// Every distinct RFC 2119 keyword recognized in the story's atoms, mapped to its canonical
  /// <see cref="Level"/> family (spec §2). The keys are the exact tokens used in the
  /// <c>[R-… · KEYWORD]</c> markers.
  /// </summary>
  public static IReadOnlyDictionary<string, Level> RequirementKeywords { get; } =
    new Dictionary<string, Level>(StringComparer.Ordinal)
    {
      ["MUST"] = Level.Must,
      ["MUST NOT"] = Level.Must,
      ["REQUIRED"] = Level.Must,
      ["SHALL"] = Level.Must,
      ["SHALL NOT"] = Level.Must,
      ["SHOULD"] = Level.Should,
      ["SHOULD NOT"] = Level.Should,
      ["RECOMMENDED"] = Level.Should,
      ["MAY"] = Level.May,
      ["OPTIONAL"] = Level.May,
    };

  /// <summary>The three requirement-level families, strongest first (spec §2).</summary>
  public static IReadOnlyList<Level> RequirementLevels { get; } = [Level.Must, Level.Should, Level.May];

  /// <summary>
  /// Classifies a normative <paramref name="keyword"/> into its <see cref="Level"/> family (spec §2).
  /// Returns <c>null</c> for an unrecognized token — never throws — so a conformance harness can report
  /// rather than crash on a malformed marker.
  /// </summary>
  /// <param name="keyword">The RFC 2119 keyword token.</param>
  /// <returns>The level family, or <c>null</c>.</returns>
  public static Level? ClassifyRequirementLevel(string keyword) =>
    RequirementKeywords.TryGetValue(keyword, out var level) ? level : null;

  /// <summary>Returns <c>true</c> when <paramref name="keyword"/> is a MANDATORY keyword (MUST family) (spec §2, R-29.1-a).</summary>
  /// <param name="keyword">The keyword token.</param>
  /// <returns><c>true</c> when mandatory.</returns>
  public static bool IsMandatoryKeyword(string keyword) => ClassifyRequirementLevel(keyword) == Level.Must;

  /// <summary>Returns <c>true</c> when <paramref name="keyword"/> is ADVISORY (SHOULD family) (spec §2).</summary>
  /// <param name="keyword">The keyword token.</param>
  /// <returns><c>true</c> when advisory.</returns>
  public static bool IsAdvisoryKeyword(string keyword) => ClassifyRequirementLevel(keyword) == Level.Should;

  /// <summary>Returns <c>true</c> when <paramref name="keyword"/> is OPTIONAL (MAY family) (spec §2, §29.5).</summary>
  /// <param name="keyword">The keyword token.</param>
  /// <returns><c>true</c> when optional.</returns>
  public static bool IsOptionalKeyword(string keyword) => ClassifyRequirementLevel(keyword) == Level.May;

  // ─── The conformance-requirement registry (§29) ─────────────────────────────────

  /// <summary>
  /// One normative requirement ("atom") of §29/§30, identified by its stable id, its subsection, the
  /// role(s)/axis it binds, and its RFC 2119 level. A conformance harness enumerates these to know
  /// exactly what to check.
  /// </summary>
  /// <param name="Id">The stable requirement id, e.g. <c>R-29.2-h</c>.</param>
  /// <param name="Section">The §29/§30 subsection, e.g. <c>29.2</c>.</param>
  /// <param name="Keyword">The RFC 2119 keyword exactly as the story marks it.</param>
  /// <param name="Level">The canonical level family derived from <paramref name="Keyword"/>.</param>
  /// <param name="Axis">Which conformance axis the requirement constrains.</param>
  /// <param name="Roles">The role(s) the requirement binds; empty ⇒ binds every role.</param>
  /// <param name="Statement">A one-line restatement of the obligation.</param>
  public sealed record ConformanceRequirement(
    string Id,
    string Section,
    string Keyword,
    Level Level,
    Axis Axis,
    IReadOnlyList<Role> Roles,
    string Statement);

  private static readonly IReadOnlyList<Role> Both = [Role.Client, Role.Server];
  private static readonly IReadOnlyList<Role> ServerOnly = [Role.Server];
  private static readonly IReadOnlyList<Role> ClientOnly = [Role.Client];

  /// <summary>Builds a <see cref="ConformanceRequirement"/>, deriving its level from <paramref name="keyword"/>.</summary>
  private static ConformanceRequirement Req(
    string id, string section, string keyword, Axis axis, IReadOnlyList<Role> roles, string statement) =>
    new(id, section, keyword, RequirementKeywords[keyword], axis, roles, statement);

  /// <summary>
  /// The complete registry of §29/§30 normative requirements, in document order (spec §29.1–§29.9,
  /// §30). Each entry mirrors exactly one <c>[R-… · KEYWORD]</c> atom; the keyword and level honor the
  /// spec verbatim.
  /// </summary>
  public static IReadOnlyList<ConformanceRequirement> All { get; } =
  [
    // §29.1 — Meaning of conformance
    Req("R-29.1-a", "29.1", "MUST", Axis.Role, Both, "Conformant iff every applicable normative requirement for the roles played and features advertised is satisfied."),
    Req("R-29.1-b", "29.1", "MUST", Axis.Role, Both, "An implementation playing both client and server roles must satisfy each role’s requirements."),
    Req("R-29.1-c", "29.1", "MUST", Axis.Feature, Both, "Every conformant implementation uses the §3 base message format for all protocol traffic."),
    Req("R-29.1-d", "29.1", "MUST", Axis.Feature, Both, "Every conformant implementation operates under the stateless, per-request model of §4."),
    Req("R-29.1-e", "29.1", "MUST NOT", Axis.Feature, Both, "Deriving protocol-significant state from connection/process/stream identity rather than the §4 envelope is non-conformant."),
    Req("R-29.1-f", "29.1", "MAY", Axis.Feature, Both, "Requirements may be satisfied by any internal architecture in any language; only messages and observable behavior are constrained."),

    // §29.2 — Baseline server conformance
    Req("R-29.2-a", "29.2", "MUST", Axis.Role, ServerOnly, "A server implements server/discover; its obligation to answer is unconditional."),
    Req("R-29.2-b", "29.2", "MAY", Axis.Role, ClientOnly, "A client may call server/discover before any other request, but is not obligated to."),
    Req("R-29.2-c", "29.2", "MUST", Axis.Role, ServerOnly, "A server advertises its supported revisions and capabilities via server/discover, consistently with §6."),
    Req("R-29.2-d", "29.2", "MUST NOT", Axis.Role, ServerOnly, "A server must not advertise a revision or capability whose required behavior it does not implement."),
    Req("R-29.2-e", "29.2", "MUST", Axis.Role, ServerOnly, "A server honors the §4 per-request metadata envelope on every request."),
    Req("R-29.2-f", "29.2", "MUST NOT", Axis.Role, ServerOnly, "A server must not infer protocol-significant state across requests, even on the same connection/process/stream."),
    Req("R-29.2-g", "29.2", "MUST NOT", Axis.Role, ServerOnly, "A server must not require a client to reuse the same connection or process for related operations."),
    Req("R-29.2-h", "29.2", "MUST", Axis.Role, ServerOnly, "An unsupported declared revision is rejected with -32004 whose data lists supported revisions and the requested one."),
    Req("R-29.2-i", "29.2", "MUST", Axis.Role, ServerOnly, "A request needing an undeclared client capability is rejected with -32003 whose data.requiredCapabilities carries the ClientCapabilities."),
    Req("R-29.2-j", "29.2", "MUST", Axis.Role, ServerOnly, "A request omitting any §4-required field is malformed and rejected with -32602 (Invalid params)."),
    Req("R-29.2-k", "29.2", "MUST", Axis.Role, ServerOnly, "A server sets the resultType discriminator on every successful result."),
    Req("R-29.2-l", "29.2", "MUST", Axis.Role, ServerOnly, "The resultType value is drawn from the core set plus values contributed by advertised extensions only."),
    Req("R-29.2-m", "29.2", "MUST", Axis.Role, ServerOnly, "A server gates every feature behind its advertised capability."),
    Req("R-29.2-n", "29.2", "MUST NOT", Axis.Role, ServerOnly, "A server must not expose/exercise/depend on unadvertised behavior, nor solicit an undeclared client behavior."),

    // §29.3 — Baseline client conformance
    Req("R-29.3-a", "29.3", "MUST", Axis.Role, ClientOnly, "Every client request carries the protocol revision, client identity, and relevant client capabilities in per-request metadata."),
    Req("R-29.3-b", "29.3", "MUST", Axis.Role, ClientOnly, "A client sends a revision it supports and can select a mutually supported revision."),
    Req("R-29.3-c", "29.3", "SHOULD", Axis.Role, ClientOnly, "On a -32004 the client should reselect from the server’s supported list and retry, or surface an error if none overlaps."),
    Req("R-29.3-d", "29.3", "MUST", Axis.Role, ClientOnly, "A client treats designated-opaque values (cursors, requestState, subscription ids, handles) as opaque."),
    Req("R-29.3-e", "29.3", "MUST NOT", Axis.Role, ClientOnly, "A client must not inspect/parse/modify/assume anything about designated-opaque values."),
    Req("R-29.3-f", "29.3", "MUST", Axis.Role, ClientOnly, "When echoing an opaque value back, the client echoes the exact value unchanged."),
    Req("R-29.3-g", "29.3", "MUST", Axis.Role, ClientOnly, "A client can fulfill an input_required result for the capabilities it declares."),
    Req("R-29.3-h", "29.3", "MUST", Axis.Role, ClientOnly, "On an input_required carrying input requests, the client constructs the inputs before retrying."),
    Req("R-29.3-i", "29.3", "MAY", Axis.Role, ClientOnly, "If no input requests are present in an input_required result, the client may retry immediately."),
    Req("R-29.3-j", "29.3", "MUST", Axis.Role, ClientOnly, "The retry uses a distinct request id, echoes requestState exactly when provided, and omits it when none was provided."),
    Req("R-29.3-k", "29.3", "MUST", Axis.Role, ClientOnly, "A client interprets each result by its resultType and applies the §29.6 robustness rules to unrecognized values/fields/codes."),

    // §29.4 — Capability-conditioned conformance
    Req("R-29.4-a", "29.4", "MUST", Axis.Feature, Both, "Advertising a capability binds the implementation to every MUST-level behavior defined for it."),
    Req("R-29.4-b", "29.4", "MUST", Axis.Feature, ServerOnly, "A server advertising tools satisfies the tools requirements of §16."),
    Req("R-29.4-c", "29.4", "MUST", Axis.Feature, ServerOnly, "A server advertising resources satisfies §17, and resource subscriptions additionally satisfy §10."),
    Req("R-29.4-d", "29.4", "MUST", Axis.Feature, ServerOnly, "A server advertising prompts satisfies the prompts requirements of §18."),
    Req("R-29.4-e", "29.4", "MUST", Axis.Feature, ServerOnly, "A server advertising completion satisfies the completion requirements of §19."),
    Req("R-29.4-f", "29.4", "MUST", Axis.Feature, ClientOnly, "A client advertising elicitation satisfies the elicitation requirements of §20."),
    Req("R-29.4-g", "29.4", "MUST", Axis.Feature, Both, "Any party advertising a streaming or subscription capability satisfies the applicable requirements of §10."),
    Req("R-29.4-h", "29.4", "MUST NOT", Axis.Feature, Both, "An implementation must not exercise/expose/depend on a feature it has not advertised."),
    Req("R-29.4-i", "29.4", "MUST NOT", Axis.Feature, ServerOnly, "A server must not return a result type, solicit a client capability, or invoke a behavior outside what it advertised."),
    Req("R-29.4-j", "29.4", "MUST NOT", Axis.Feature, Both, "An implementation must not advertise a capability whose required behavior it does not implement."),
    Req("R-29.4-k", "29.4", "MUST NOT", Axis.Feature, ServerOnly, "A server must not rely on an undeclared client capability; if required, it responds with -32003."),
    Req("R-29.4-l", "29.4", "MUST NOT", Axis.Feature, ServerOnly, "A server must not place an input request of a kind the client has not declared into an input_required result."),
    Req("R-29.4-m", "29.4", "MUST", Axis.Feature, Both, "For a deprecated client-provided capability, an implementation that advertises one implements its specified behavior."),
    Req("R-29.4-n", "29.4", "MUST NOT", Axis.Feature, Both, "For a deprecated client-provided capability, an implementation that does not advertise one must not rely on it."),

    // §29.5 — Optionality of extensions and deprecated features
    Req("R-29.5-a", "29.5", "OPTIONAL", Axis.Feature, Both, "The extension mechanism, Tasks, and UI extensions are optional; advertising zero extensions is fully conformant."),
    Req("R-29.5-b", "29.5", "MUST", Axis.Feature, Both, "An implementation advertising an extension implements its MUST-level behaviors and follows its declared fallback."),
    Req("R-29.5-c", "29.5", "MUST", Axis.Feature, Both, "Extension identifiers follow the naming rules of §6."),
    Req("R-29.5-d", "29.5", "MUST", Axis.Feature, Both, "When a peer lacks an advertised extension, the supporting party reverts to core behavior or rejects with an appropriate error."),
    Req("R-29.5-e", "29.5", "OPTIONAL", Axis.Feature, Both, "Features whose status is Deprecated are optional to implement."),
    Req("R-29.5-f", "29.5", "MUST", Axis.Feature, Both, "A Deprecated feature that is implemented follows its specified behavior in full; partial/divergent implementation is non-conformant."),

    // §29.6 — Robustness and forward compatibility
    Req("R-29.6-a", "29.6", "MUST", Axis.Feature, Both, "A conformant implementation is tolerant of inputs richer than it understands."),
    Req("R-29.6-b", "29.6", "MUST", Axis.Feature, Both, "An implementation ignores unrecognized fields in any received object rather than rejecting the message."),
    Req("R-29.6-c", "29.6", "MUST", Axis.Feature, Both, "An implementation ignores unrecognized advertised capabilities and does not treat them as an error."),
    Req("R-29.6-d", "29.6", "MUST", Axis.Feature, Both, "An implementation ignores unrecognized extension identifiers in the extensions map (triggering §29.5 fallback)."),
    Req("R-29.6-e", "29.6", "MUST", Axis.Role, ClientOnly, "A client accepts unrecognized error codes as request failures without crashing or misclassifying them."),
    Req("R-29.6-f", "29.6", "MUST", Axis.Feature, Both, "A resultType value not recognized by the receiver is treated as an error."),
    Req("R-29.6-g", "29.6", "MUST NOT", Axis.Role, ClientOnly, "A client must not act on a result whose discriminator it cannot interpret."),
    Req("R-29.6-h", "29.6", "MUST", Axis.Feature, Both, "Where the resultType discriminator is absent, the receiver applies the §3 absence rule."),
    Req("R-29.6-i", "29.6", "MUST NOT", Axis.Feature, Both, "Ignoring the unrecognized must not silently discard understood, semantically required content."),

    // §29.7 — Conformance and the stateless model
    Req("R-29.7-a", "29.7", "MUST", Axis.Feature, ServerOnly, "A server processes each request independently and must not infer context from any earlier request."),
    Req("R-29.7-b", "29.7", "MUST", Axis.Feature, Both, "State spanning requests is referenced by an explicit identifier or opaque value the client supplies on each request."),
    Req("R-29.7-c", "29.7", "MUST NOT", Axis.Feature, Both, "An implementation must not treat the connection/process as the lifetime boundary of a conversation, task, or subscription."),
    Req("R-29.7-d", "29.7", "MUST", Axis.Feature, ServerOnly, "A requestState that passes through a client is treated as attacker-controlled input."),
    Req("R-29.7-e", "29.7", "MUST", Axis.Feature, ServerOnly, "If requestState influences authorization/resource access/business logic, the server protects its integrity and rejects state failing verification."),

    // §29.8 — Transport conformance
    Req("R-29.8-a", "29.8", "MUST", Axis.Transport, Both, "A conformant implementation implements at least one §7 transport."),
    Req("R-29.8-b", "29.8", "MUST", Axis.Transport, Both, "Each implemented transport upholds its framing, routing, and error-mapping requirements (stdio §8, Streamable HTTP §9)."),
    Req("R-29.8-c", "29.8", "MUST", Axis.Transport, Both, "On Streamable HTTP, -32602 (malformed/missing field) and -32003 (missing required capability) map to the prescribed HTTP statuses."),
    Req("R-29.8-d", "29.8", "SHOULD", Axis.Transport, Both, "An HTTP-based transport should conform to §23 Authorization."),
    Req("R-29.8-e", "29.8", "SHOULD NOT", Axis.Transport, Both, "A stdio transport should not apply the authorization framework; it obtains credentials from its environment."),
    Req("R-29.8-f", "29.8", "MUST NOT", Axis.Transport, Both, "Conformance of one transport must not be contingent on another; each independently satisfies its own requirements."),
    Req("R-29.8-g", "29.8", "MAY", Axis.Transport, Both, "Multiple transports may be offered concurrently."),

    // §29.9 — Determining conformance
    Req("R-29.9-a", "29.9", "MAY", Axis.Feature, Both, "An implementation satisfying every applicable requirement is conformant; no behavior outside this document is required."),
    Req("R-29.9-b", "29.9", "MUST", Axis.Feature, Both, "An implementation either fully satisfies an advertised feature’s MUST-level behavior or must not advertise it; no partial state."),
    Req("R-29.9-c", "29.9", "MUST", Axis.Feature, Both, "For features in its profile, an implementation uses the exact codes (App. B), _meta keys (App. C), and capability identifiers (App. D)."),

    // §30 — References
    Req("R-30-a", "30", "MAY", Axis.Feature, Both, "Citation markers are provenance only and never load-bearing; all normative content is in the body."),
  ];

  private static readonly IReadOnlyDictionary<string, ConformanceRequirement> ById =
    All.ToDictionary(r => r.Id, StringComparer.Ordinal);

  /// <summary>Looks up a requirement by its id (e.g. <c>R-29.2-h</c>), or <c>null</c>.</summary>
  /// <param name="id">The requirement id.</param>
  /// <returns>The requirement, or <c>null</c>.</returns>
  public static ConformanceRequirement? Lookup(string id) => ById.TryGetValue(id, out var r) ? r : null;

  /// <summary>Returns every requirement whose axis matches <paramref name="axis"/> (spec §29.1).</summary>
  /// <param name="axis">The conformance axis.</param>
  /// <returns>The matching requirements, in document order.</returns>
  public static IReadOnlyList<ConformanceRequirement> ForAxis(Axis axis) =>
    All.Where(r => r.Axis == axis).ToList();

  /// <summary>
  /// Returns every requirement that binds <paramref name="role"/> (spec §29.1 item 1). A requirement
  /// with an empty roles list binds every role; otherwise it binds only the named roles.
  /// </summary>
  /// <param name="role">The role.</param>
  /// <returns>The matching requirements, in document order.</returns>
  public static IReadOnlyList<ConformanceRequirement> ForRole(Role role) =>
    All.Where(r => r.Roles.Count == 0 || r.Roles.Contains(role)).ToList();

  // ─── §6 / Appendix D — Capability → obligation map (§29.4) ───────────────────────

  /// <summary>
  /// One capability-conditioned obligation: advertising <paramref name="Capability"/> binds the
  /// advertising <paramref name="Party"/> to the MUST-level requirements of <paramref name="Section"/>
  /// (spec §29.4 item 1, R-29.4-b – R-29.4-g).
  /// </summary>
  /// <param name="Capability">The advertised capability identifier (Appendix D / §6).</param>
  /// <param name="Party">Which party advertises and is thereby bound.</param>
  /// <param name="Section">The spec section whose MUST-level behavior the advertiser must satisfy.</param>
  /// <param name="AdditionalSections">Any additional sections also bound (e.g. subscriptions → §10).</param>
  public sealed record CapabilityObligation(
    string Capability, Role Party, string Section, IReadOnlyList<string> AdditionalSections);

  /// <summary>
  /// The per-capability obligation map of §29.4 (spec R-29.4-b – R-29.4-g): tools → §16, resources →
  /// §17 (resources.subscribe additionally → §10), prompts → §18, completions → §19, elicitation → §20
  /// (client).
  /// </summary>
  public static IReadOnlyList<CapabilityObligation> CapabilityObligations { get; } =
  [
    new("tools", Role.Server, "16", []),
    new("resources", Role.Server, "17", []),
    new("resources.subscribe", Role.Server, "17", ["10"]),
    new("prompts", Role.Server, "18", []),
    new("completions", Role.Server, "19", []),
    new("elicitation", Role.Client, "20", []),
  ];

  /// <summary>
  /// Returns the obligation a party incurs by advertising <paramref name="capability"/>, or <c>null</c>
  /// when the capability carries no enumerated feature-section obligation (spec §29.4).
  /// </summary>
  /// <param name="capability">The capability identifier.</param>
  /// <returns>The obligation, or <c>null</c>.</returns>
  public static CapabilityObligation? ObligationForCapability(string capability) =>
    CapabilityObligations.FirstOrDefault(o => string.Equals(o.Capability, capability, StringComparison.Ordinal));

  /// <summary>
  /// Returns the spec sections whose MUST-level behavior an implementation is bound to, given the
  /// capabilities it advertises (spec §29.4 item 1, R-29.4-a – R-29.4-g). The result is deterministic,
  /// de-duplicated, numerically sorted, and includes the additional sections.
  /// </summary>
  /// <param name="advertised">The advertised capability identifiers.</param>
  /// <returns>The bound sections, numerically sorted.</returns>
  public static IReadOnlyList<string> ObligedSectionsForCapabilities(IEnumerable<string> advertised)
  {
    ArgumentNullException.ThrowIfNull(advertised);
    var sections = new HashSet<string>(StringComparer.Ordinal);
    foreach (var capability in advertised)
    {
      var obligation = ObligationForCapability(capability);
      if (obligation is null) continue;
      sections.Add(obligation.Section);
      foreach (var extra in obligation.AdditionalSections) sections.Add(extra);
    }
    return sections.OrderBy(s => int.Parse(s, System.Globalization.CultureInfo.InvariantCulture)).ToList();
  }

  // ─── §29.2 — Baseline server request disposition ────────────────────────────────

  /// <summary>The stage at which a baseline-server request is rejected, or acceptance (spec §29.2).</summary>
  public enum ServerRequestStage
  {
    /// <summary>The request is accepted and proceeds to a resultType-tagged success.</summary>
    Accepted,

    /// <summary>§29.2 item 4 failed: unsupported declared revision (R-29.2-h).</summary>
    Revision,

    /// <summary>§29.2 item 6 failed: a §4-required envelope field is missing/malformed (R-29.2-j).</summary>
    Envelope,

    /// <summary>§29.2 item 5 failed: a required client capability was not declared (R-29.2-i, R-29.4-k).</summary>
    Capability,

    /// <summary>§29.2 item 8 failed: the feature is not gated by an advertised capability (R-29.2-m, R-29.2-n).</summary>
    Gating,
  }

  /// <summary>
  /// The disposition a conformant server reaches for an incoming request after the ordered §29.2 checks
  /// (spec §29.2). On a revision failure, <see cref="Code"/> is <c>-32004</c> and <see cref="Supported"/>
  /// / <see cref="Requested"/> are populated; on an envelope failure, <see cref="Code"/> is <c>-32602</c>
  /// with a <see cref="Message"/>; on a capability failure, <see cref="Code"/> is <c>-32003</c> with
  /// <see cref="RequiredCapabilities"/>; on a gating refusal, none of these are set.
  /// </summary>
  /// <param name="Ok"><c>true</c> when the request is accepted.</param>
  /// <param name="Stage">The stage reached.</param>
  /// <param name="Code">The JSON-RPC error code on a rejection, or <c>null</c>.</param>
  /// <param name="Message">The error message on an envelope failure, or <c>null</c>.</param>
  /// <param name="Supported">The supported revisions on a revision failure, or <c>null</c>.</param>
  /// <param name="Requested">The requested revision on a revision failure, or <c>null</c>.</param>
  /// <param name="RequiredCapabilities">The missing capabilities on a capability failure, or <c>null</c>.</param>
  public sealed record ServerRequestDisposition(
    bool Ok,
    ServerRequestStage Stage,
    int? Code = null,
    string? Message = null,
    IReadOnlyList<string>? Supported = null,
    string? Requested = null,
    JsonObject? RequiredCapabilities = null);

  // A well-formed protocol-revision value is YYYY-MM-DD.
  [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
  private static partial Regex RevisionRegex();

  /// <summary>
  /// Applies the ordered §29.2 baseline-server request checks to ONE self-contained §4 request and
  /// returns its <see cref="ServerRequestDisposition"/> (spec §29.2, R-29.2-e – R-29.2-n, R-29.4-k).
  /// The checks run strictly in the §7 flow order — judged on this request's own envelope, NEVER on
  /// connection or prior-request state (R-29.1-e, R-29.2-f):
  /// </summary>
  /// <remarks>
  /// <list type="number">
  /// <item><description>revision supported? → else <c>-32004</c> (data: supported, requested);</description></item>
  /// <item><description>all §4-required fields present? → else <c>-32602</c> (Invalid params);</description></item>
  /// <item><description>required client capability declared? → else <c>-32003</c> (data.requiredCapabilities);</description></item>
  /// <item><description>feature gated by an advertised capability? → else refuse (not advertised);</description></item>
  /// <item><description>else → accept.</description></item>
  /// </list>
  /// A malformed (non-<c>YYYY-MM-DD</c>) protocol-version value is an envelope failure (<c>-32602</c>),
  /// not a <c>-32004</c>: the revision check first asks whether the declared revision is a
  /// well-formed, server-unsupported one.
  /// </remarks>
  /// <param name="meta">The request's <c>params._meta</c> envelope (raw).</param>
  /// <param name="serverSupportedRevisions">The revisions the server supports.</param>
  /// <param name="requiredClientCapabilities">The capabilities required to process this request (raw), or <c>null</c>.</param>
  /// <param name="featureAdvertised">Whether the feature is gated behind an advertised capability; <c>null</c> ⇒ unconstrained.</param>
  /// <returns>The request disposition.</returns>
  public static ServerRequestDisposition ClassifyServerRequest(
    JsonObject meta,
    IReadOnlyList<string> serverSupportedRevisions,
    JsonObject? requiredClientCapabilities = null,
    bool? featureAdvertised = null)
  {
    ArgumentNullException.ThrowIfNull(meta);
    ArgumentNullException.ThrowIfNull(serverSupportedRevisions);

    // (1) Unsupported revision — only when the declared version is a well-formed string the server
    //     does not support. A missing/malformed version is an envelope failure handled by step (2).
    if (meta.TryGetPropertyValue(MetaKeys.ProtocolVersion, out var revNode) &&
        revNode is JsonValue revValue && revValue.TryGetValue<string>(out var declaredRevision) &&
        RevisionRegex().IsMatch(declaredRevision) &&
        !serverSupportedRevisions.Contains(declaredRevision, StringComparer.Ordinal))
    {
      return new ServerRequestDisposition(
        false, ServerRequestStage.Revision,
        Code: ErrorCodes.UnsupportedProtocolVersion,
        Supported: serverSupportedRevisions.ToList(),
        Requested: declaredRevision);
    }

    // (2) Malformed envelope — any §4-required field missing/invalid.
    var envelope = ValidateRequestMeta(meta);
    if (!envelope.Ok)
    {
      return new ServerRequestDisposition(
        false, ServerRequestStage.Envelope, Code: ErrorCodes.InvalidParams, Message: envelope.Message);
    }

    // (3) Missing required client capability.
    if (requiredClientCapabilities is not null)
    {
      var declared = meta[MetaKeys.ClientCapabilities] as JsonObject ?? new JsonObject();
      var required = ComputeMissingClientCapabilities(declared, requiredClientCapabilities);
      if (required.Count > 0)
      {
        return new ServerRequestDisposition(
          false, ServerRequestStage.Capability,
          Code: ErrorCodes.MissingRequiredClientCapability,
          RequiredCapabilities: required);
      }
    }

    // (4) Capability gating — refuse any feature not advertised.
    if (featureAdvertised == false)
    {
      return new ServerRequestDisposition(false, ServerRequestStage.Gating);
    }

    return new ServerRequestDisposition(true, ServerRequestStage.Accepted);
  }

  /// <summary>Outcome of <see cref="ValidateRequestMeta"/>.</summary>
  /// <param name="Ok"><c>true</c> when every §4-required field is present and well-typed.</param>
  /// <param name="Message">The failure message when <paramref name="Ok"/> is <c>false</c>.</param>
  private readonly record struct MetaValidation(bool Ok, string? Message);

  /// <summary>
  /// Validates that a raw <c>_meta</c> envelope carries the three §4-required fields (protocol revision
  /// as a string, client identity and client capabilities as objects), mirroring the TS
  /// <c>validateRequestMeta</c> boolean check. Used by both the server-side envelope gate and the
  /// client-side baseline check so the same required-field definition is honored.
  /// </summary>
  private static MetaValidation ValidateRequestMeta(JsonObject meta)
  {
    if (meta[MetaKeys.ProtocolVersion] is not JsonValue pv || !pv.TryGetValue<string>(out var protocolVersion))
    {
      return new MetaValidation(false, $"Required request metadata key \"{MetaKeys.ProtocolVersion}\" is missing or not a string (§4.3).");
    }
    // The value MUST be a well-formed YYYY-MM-DD revision identifier (§5.1); a malformed-but-string
    // version is an envelope failure, not an unsupported-revision rejection.
    if (!RevisionRegex().IsMatch(protocolVersion))
    {
      return new MetaValidation(false, $"Request metadata key \"{MetaKeys.ProtocolVersion}\" value \"{protocolVersion}\" is not a valid YYYY-MM-DD revision identifier (§5.1).");
    }
    if (meta[MetaKeys.ClientInfo] is not JsonObject)
    {
      return new MetaValidation(false, $"Required request metadata key \"{MetaKeys.ClientInfo}\" is missing or not an object (§4.3).");
    }
    if (meta[MetaKeys.ClientCapabilities] is not JsonObject)
    {
      return new MetaValidation(false, $"Required request metadata key \"{MetaKeys.ClientCapabilities}\" is missing or not an object (§4.3).");
    }
    return new MetaValidation(true, null);
  }

  /// <summary>
  /// Returns the subset of <paramref name="required"/> top-level capability keys not present in
  /// <paramref name="declared"/> — the missing client capabilities a server would report in a
  /// <c>-32003</c> error's <c>data.requiredCapabilities</c> (spec §29.2 item 5, R-29.4-k). A NEW object
  /// is returned (a deep clone of the missing entries).
  /// </summary>
  private static JsonObject ComputeMissingClientCapabilities(JsonObject declared, JsonObject required)
  {
    var missing = new JsonObject();
    foreach (var (key, value) in required)
    {
      if (!declared.ContainsKey(key))
      {
        missing[key] = value?.DeepClone();
      }
    }
    return missing;
  }

  /// <summary>The result-type validation outcome for <see cref="ValidateSuccessResultType"/>.</summary>
  public enum ResultTypeFailure
  {
    /// <summary>No failure (success).</summary>
    None,

    /// <summary>The discriminator is absent.</summary>
    Missing,

    /// <summary>Present but not in the accepted (core + active-extension) set.</summary>
    NotAdvertised,
  }

  /// <summary>Outcome of <see cref="ValidateSuccessResultType"/>.</summary>
  /// <param name="Ok"><c>true</c> when the result carries an accepted discriminator.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="ResultType">The discriminator value (when present).</param>
  public readonly record struct SuccessResultTypeValidation(bool Ok, ResultTypeFailure Reason, string? ResultType);

  /// <summary>
  /// Asserts that a successful result carries a <c>resultType</c> discriminator drawn from the core set
  /// plus the values of advertised extensions only (spec §29.2 items 7 &amp; 8, R-29.2-k, R-29.2-l).
  /// </summary>
  /// <param name="result">The success result object (raw).</param>
  /// <param name="activeExtensionSet">The extensions active for this interaction.</param>
  /// <param name="extensionResultTypes">Map of extension id → the <c>resultType</c> values it contributes.</param>
  /// <returns>The validation outcome.</returns>
  public static SuccessResultTypeValidation ValidateSuccessResultType(
    JsonObject result,
    IEnumerable<string>? activeExtensionSet = null,
    IReadOnlyDictionary<string, IEnumerable<string>>? extensionResultTypes = null)
  {
    ArgumentNullException.ThrowIfNull(result);
    if (result["resultType"] is not JsonValue rt || !rt.TryGetValue<string>(out var raw))
    {
      return new SuccessResultTypeValidation(false, ResultTypeFailure.Missing, null);
    }
    if (!Extensions.IsResultTypeAccepted(raw, activeExtensionSet ?? [], extensionResultTypes))
    {
      return new SuccessResultTypeValidation(false, ResultTypeFailure.NotAdvertised, raw);
    }
    return new SuccessResultTypeValidation(true, ResultTypeFailure.None, raw);
  }

  // ─── §29.3 — Baseline client conformance helpers ────────────────────────────────

  /// <summary>
  /// Validates that a client request's metadata carries the three §4-required fields — protocol
  /// revision, client identity, and client capabilities — mandated on EVERY request (spec §29.3 item 1,
  /// R-29.3-a). A thin wrapper over the shared envelope check.
  /// </summary>
  /// <param name="meta">The request's <c>_meta</c> envelope (raw).</param>
  /// <returns><c>true</c> when the baseline envelope is present.</returns>
  public static bool ClientRequestCarriesBaselineEnvelope(JsonObject meta)
  {
    ArgumentNullException.ThrowIfNull(meta);
    return ValidateRequestMeta(meta).Ok;
  }

  /// <summary>
  /// The fields a client MUST include in every request's per-request metadata (spec §29.3 item 1,
  /// R-29.3-a). Exposed for a conformance harness to assert presence.
  /// </summary>
  public static IReadOnlyList<string> RequiredClientRequestMetaKeys { get; } =
    [MetaKeys.ProtocolVersion, MetaKeys.ClientInfo, MetaKeys.ClientCapabilities];

  /// <summary>The result of validating an <c>input_required</c> retry request (spec §29.3 item 4).</summary>
  public enum RetryFailure
  {
    /// <summary>No failure (success).</summary>
    None,

    /// <summary>The retry reused the original request id.</summary>
    ReusedId,

    /// <summary>The retry did not echo the provided <c>requestState</c> byte-for-byte.</summary>
    StateMismatch,

    /// <summary>The retry carried a <c>requestState</c> when none was provided.</summary>
    UnexpectedState,
  }

  /// <summary>Outcome of <see cref="ValidateInputRequiredRetry"/>.</summary>
  /// <param name="Ok"><c>true</c> when the retry is well-formed.</param>
  /// <param name="Reason">The first violated rule when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct InputRequiredRetryValidation(bool Ok, RetryFailure Reason);

  /// <summary>
  /// Validates a client's retry request after an <c>input_required</c> result (spec §29.3 item 4,
  /// R-29.3-j). The retry MUST use a request id distinct from the original, echo <c>requestState</c>
  /// byte-for-byte when one was provided, and omit it when none was provided. Identity comparison uses
  /// <see cref="RequestId"/> value equality, which preserves the JSON type (a numeric and a string id
  /// are never coerced); <c>requestState</c> comparison is ordinal string equality (the value is opaque
  /// and echoed exactly, R-29.3-f).
  /// </summary>
  /// <param name="originalId">The original request's id (a JSON string or number).</param>
  /// <param name="retryId">The retry request's id (must differ from the original).</param>
  /// <param name="providedState">The <c>requestState</c> the server provided, or <c>null</c> when none.</param>
  /// <param name="retryState">The <c>requestState</c> the retry carries, or <c>null</c> when absent.</param>
  /// <returns>The validation outcome.</returns>
  public static InputRequiredRetryValidation ValidateInputRequiredRetry(
    RequestId originalId,
    RequestId retryId,
    string? providedState = null,
    string? retryState = null)
  {
    if (retryId.Equals(originalId))
    {
      return new InputRequiredRetryValidation(false, RetryFailure.ReusedId);
    }
    if (providedState is null)
    {
      // No state was provided → the retry MUST NOT include one.
      return retryState is not null
        ? new InputRequiredRetryValidation(false, RetryFailure.UnexpectedState)
        : new InputRequiredRetryValidation(true, RetryFailure.None);
    }
    // State was provided → the retry MUST echo it exactly.
    return string.Equals(retryState, providedState, StringComparison.Ordinal)
      ? new InputRequiredRetryValidation(true, RetryFailure.None)
      : new InputRequiredRetryValidation(false, RetryFailure.StateMismatch);
  }

  // ─── §29.4 item 5 — No unsolicited input requests ───────────────────────────────

  /// <summary>
  /// The map from an input-request method to the client capability that authorizes a server to place it
  /// into an <c>input_required</c> result (spec §29.4 item 5, R-29.4-l).
  /// </summary>
  public static IReadOnlyDictionary<string, string> InputRequestRequiredCapability { get; } =
    new Dictionary<string, string>(StringComparer.Ordinal)
    {
      [McpMethods.ElicitationCreate] = "elicitation",
      [McpMethods.RootsList] = "roots",
      [McpMethods.SamplingCreateMessage] = "sampling",
    };

  /// <summary>
  /// Returns <c>true</c> when a server MAY place an input request of <paramref name="method"/> into an
  /// <c>input_required</c> result for a client declaring <paramref name="clientCapabilities"/> (spec
  /// §29.4 item 5, R-29.4-l). An unrecognized method is rejected: a server must not solicit a kind it
  /// cannot tie to a declared capability.
  /// </summary>
  /// <param name="method">The input-request method.</param>
  /// <param name="clientCapabilities">The client's declared capabilities (raw).</param>
  /// <returns><c>true</c> when the server may place the input request.</returns>
  public static bool MayPlaceInputRequest(string method, JsonObject clientCapabilities)
  {
    ArgumentNullException.ThrowIfNull(clientCapabilities);
    if (!InputRequestRequiredCapability.TryGetValue(method, out var required)) return false;
    return clientCapabilities.ContainsKey(required);
  }

  // ─── §29.6 — Robustness & forward compatibility ─────────────────────────────────

  /// <summary>How a conformant receiver disposes of an element of a received message under §29.6 (spec §29.6).</summary>
  public enum RobustnessDispositionKind
  {
    /// <summary>A recognized, understood element: process it normally.</summary>
    Accept,

    /// <summary>An unrecognized field/capability/extension: ignore it; do NOT reject the message (R-29.6-b/c/d).</summary>
    Ignore,

    /// <summary>An unrecognized resultType: the whole response is an error and MUST NOT be acted upon (R-29.6-f/g).</summary>
    TreatAsError,

    /// <summary>An unrecognized error code: a request failure surfaced via message/data (R-29.6-e).</summary>
    FailRequest,
  }

  /// <summary>The kind of received element being disposed of under §29.6.</summary>
  public enum RobustnessElement
  {
    /// <summary>An unrecognized field on a received object.</summary>
    Field,

    /// <summary>An unrecognized advertised capability.</summary>
    Capability,

    /// <summary>An unrecognized extension identifier.</summary>
    Extension,

    /// <summary>An unrecognized <c>resultType</c> value.</summary>
    ResultType,

    /// <summary>An unrecognized error code.</summary>
    ErrorCode,
  }

  /// <summary>
  /// Computes the §29.6 robustness disposition for one received element, given whether the receiver
  /// recognizes it (spec §29.6, R-29.6-a – R-29.6-h). A recognized element always returns
  /// <see cref="RobustnessDispositionKind.Accept"/>; robustness applies only to the unrecognized
  /// (R-29.6-i).
  /// </summary>
  /// <param name="element">The element kind.</param>
  /// <param name="recognized">Whether the receiver recognizes it.</param>
  /// <returns>The disposition.</returns>
  public static RobustnessDispositionKind RobustnessDisposition(RobustnessElement element, bool recognized)
  {
    if (recognized) return RobustnessDispositionKind.Accept;
    return element switch
    {
      RobustnessElement.Field or RobustnessElement.Capability or RobustnessElement.Extension => RobustnessDispositionKind.Ignore,
      RobustnessElement.ResultType => RobustnessDispositionKind.TreatAsError,
      RobustnessElement.ErrorCode => RobustnessDispositionKind.FailRequest,
      _ => RobustnessDispositionKind.Ignore,
    };
  }

  /// <summary>Outcome of <see cref="DecideResultAction"/>.</summary>
  /// <param name="Act"><c>true</c> when the receiver MAY act on the result.</param>
  /// <param name="ResultType">The recognized/interpreted discriminator value.</param>
  /// <param name="Unrecognized"><c>true</c> when present but not accepted (treat as error).</param>
  public readonly record struct ResultActionDecision(bool Act, string ResultType, bool Unrecognized);

  /// <summary>
  /// Applies the §29.6 + §3 receiver rules to a result's <c>resultType</c> (spec R-29.6-f, R-29.6-g,
  /// R-29.6-h). A recognized value (core or an accepted extension value) is acted upon; a present but
  /// unaccepted value is treated as an error; an ABSENT or null discriminator resolves to
  /// <c>complete</c> via the §3 absence rule and is acted upon.
  /// </summary>
  /// <param name="result">The success result object (raw).</param>
  /// <param name="activeExtensionSet">The extensions active for this interaction.</param>
  /// <param name="extensionResultTypes">Map of extension id → the <c>resultType</c> values it contributes.</param>
  /// <returns>The action decision.</returns>
  public static ResultActionDecision DecideResultAction(
    JsonObject result,
    IEnumerable<string>? activeExtensionSet = null,
    IReadOnlyDictionary<string, IEnumerable<string>>? extensionResultTypes = null)
  {
    ArgumentNullException.ThrowIfNull(result);
    var node = result["resultType"];
    // §3 absence rule (R-29.6-h): an absent/null discriminator is "complete".
    if (node is null || node.GetValueKind() == JsonValueKind.Null)
    {
      return new ResultActionDecision(true, ResultTypes.Complete, false);
    }
    var value = node is JsonValue v && v.TryGetValue<string>(out var s) ? s : node.ToString();
    if (Extensions.IsResultTypeAccepted(value, activeExtensionSet ?? [], extensionResultTypes))
    {
      return new ResultActionDecision(true, value, false);
    }
    return new ResultActionDecision(false, value, true);
  }

  // ─── §29.7 — Stateless-model conformance invariants ─────────────────────────────

  /// <summary>
  /// The stateless-model invariants that bind every role (spec §29.7, R-29.7-a – R-29.7-e). Each is
  /// unconditionally <c>true</c>; exposed as a flat checklist a conformance harness can assert against.
  /// </summary>
  /// <param name="IndependentRequests">Each request is processed independently; no context inferred from an earlier one (R-29.7-a).</param>
  /// <param name="ExplicitCrossRequestState">Cross-request state rides an explicit client-supplied identifier/opaque value (R-29.7-b).</param>
  /// <param name="ConnectionIsNotLifetimeBoundary">The connection/process is NOT the lifetime boundary of a conversation/task/subscription (R-29.7-c).</param>
  /// <param name="RequestStateIsUntrusted">A requestState passing through a client is attacker-controlled input (R-29.7-d).</param>
  /// <param name="RequestStateIntegrityProtected">A security-significant requestState is integrity-protected; failed verification is rejected (R-29.7-e).</param>
  public sealed record StatelessConformanceInvariants(
    bool IndependentRequests,
    bool ExplicitCrossRequestState,
    bool ConnectionIsNotLifetimeBoundary,
    bool RequestStateIsUntrusted,
    bool RequestStateIntegrityProtected);

  /// <summary>The §29.7 invariants, all <c>true</c> (spec R-29.7-a – R-29.7-e).</summary>
  public static StatelessConformanceInvariants StatelessInvariants { get; } =
    new(true, true, true, true, true);

  /// <summary>
  /// The trust a server may place in a <c>requestState</c> value (spec §29.7 item 4). The model admits a
  /// single value: a <c>requestState</c> that passed through a client is ALWAYS attacker-controlled input
  /// (R-29.7-d), so there is no "trusted" disposition.
  /// </summary>
  public enum RequestStateTrust
  {
    /// <summary>Attacker-controlled input — the only disposition for a client-routed <c>requestState</c> (R-29.7-d).</summary>
    Untrusted,
  }

  /// <summary>The action a server takes for a <c>requestState</c> value (spec §29.7 item 4).</summary>
  /// <param name="Trust">Always <see cref="RequestStateTrust.Untrusted"/> — a requestState is always attacker-controlled input.</param>
  /// <param name="Reject"><c>true</c> when the value must be rejected (security-significant and unverified).</param>
  public readonly record struct RequestStateHandling(RequestStateTrust Trust, bool Reject);

  /// <summary>
  /// Decides how a server must treat a <c>requestState</c> value that passed through a client (spec
  /// §29.7 item 4, R-29.7-d, R-29.7-e). It is ALWAYS attacker-controlled input; when it influences
  /// authorization, resource access, or business logic the server MUST verify its integrity and reject
  /// what fails.
  /// </summary>
  /// <param name="securitySignificant">Whether the value influences authz/resource/business logic.</param>
  /// <param name="integrityVerified">Whether the value's integrity check passed.</param>
  /// <returns>The handling decision.</returns>
  public static RequestStateHandling DecideRequestStateHandling(bool securitySignificant, bool integrityVerified) =>
    new(RequestStateTrust.Untrusted, securitySignificant && !integrityVerified);

  // ─── §29.8 — Transport conformance ──────────────────────────────────────────────

  /// <summary>The Streamable HTTP status a §29.8 negotiation/envelope error code maps to (spec §29.8 item 3).</summary>
  public const int StreamableHttpNegotiationErrorStatus = 400;

  /// <summary>
  /// Maps a protocol error <paramref name="code"/> to the HTTP status it MUST ride on the Streamable
  /// HTTP transport for the §29.8 negotiation/envelope conditions (spec §29.8 item 3, R-29.8-c).
  /// <c>-32602</c> and <c>-32003</c> map to <c>400</c>; any other code returns <c>null</c> (governed by
  /// §9 / S34, not this conformance point).
  /// </summary>
  /// <param name="code">The protocol error code.</param>
  /// <returns>The HTTP status, or <c>null</c>.</returns>
  public static int? StreamableHttpStatusForProtocolError(int code) =>
    code == ErrorCodes.InvalidParams || code == ErrorCodes.MissingRequiredClientCapability
      ? StreamableHttpNegotiationErrorStatus
      : null;

  /// <summary>
  /// How credentials are conveyed for a transport under the §29.8 conformance points (spec §29.8 items 4
  /// &amp; 5). Distinct from the §23 <see cref="Protocol.CredentialConveyance"/> in that its third case is
  /// <see cref="None"/> (neither §29.8-d nor §29.8-e applies), not a best-practice mechanism.
  /// </summary>
  public enum TransportCredentialConveyance
  {
    /// <summary>No credential-conveyance rule applies to this transport (R-29.8: any non-HTTP, non-stdio transport).</summary>
    None,

    /// <summary>Credentials ride as an OAuth bearer token (HTTP-based transport, R-29.8-d).</summary>
    Bearer,

    /// <summary>Credentials are obtained from the process environment (stdio transport, R-29.8-e).</summary>
    Environment,
  }

  /// <summary>The conformance evaluation of a SINGLE transport an implementation offers (spec §29.8).</summary>
  /// <param name="Transport">The transport being evaluated.</param>
  /// <param name="AuthorizationApplies">Whether the authorization framework SHOULD apply (HTTP) — R-29.8-d.</param>
  /// <param name="AuthorizationForbidden">Whether the authorization framework SHOULD NOT apply (stdio) — R-29.8-e.</param>
  /// <param name="CredentialConveyance">How credentials are conveyed for this transport.</param>
  public sealed record TransportConformance(
    string Transport, bool AuthorizationApplies, bool AuthorizationForbidden, TransportCredentialConveyance CredentialConveyance);

  /// <summary>
  /// Evaluates the authorization-applicability conformance points for a single transport (spec §29.8
  /// items 4 &amp; 5, R-29.8-d, R-29.8-e). An HTTP-based transport SHOULD conform to authorization and
  /// conveys credentials as a <see cref="TransportCredentialConveyance.Bearer"/> token; a stdio transport
  /// SHOULD NOT apply it and obtains credentials from its
  /// <see cref="TransportCredentialConveyance.Environment"/>; any other transport applies neither rule
  /// (<see cref="TransportCredentialConveyance.None"/>).
  /// </summary>
  /// <param name="transport">The transport name (e.g. <c>stdio</c>, <c>streamable-http</c>, <c>http</c>).</param>
  /// <returns>The transport conformance evaluation.</returns>
  public static TransportConformance EvaluateTransportConformance(string transport)
  {
    ArgumentNullException.ThrowIfNull(transport);
    return transport switch
    {
      "stdio" => new TransportConformance(transport, false, true, TransportCredentialConveyance.Environment),
      "streamable-http" or "http" => new TransportConformance(transport, true, false, TransportCredentialConveyance.Bearer),
      _ => new TransportConformance(transport, false, false, TransportCredentialConveyance.None),
    };
  }

  // ─── §6 / §29.5 — Conformance profile ───────────────────────────────────────────

  /// <summary>
  /// The abstract descriptor that fully describes an implementation's conformance: the tuple of roles,
  /// advertised revisions, advertised capabilities, advertised extensions, and implemented transports
  /// (spec §29.9 item 3, story §6). NOT a wire message — it is used to reason about and report
  /// conformance.
  /// </summary>
  public sealed record ConformanceProfile
  {
    /// <summary>The role(s) the implementation plays; binds it to each role's requirements (R-29.1-b).</summary>
    public required IReadOnlyList<Role> Roles { get; init; }

    /// <summary>The advertised protocol revisions; MUST include the wire value <c>2026-07-28</c> (R-29.9-c).</summary>
    public required IReadOnlyList<string> Revisions { get; init; }

    /// <summary>The advertised capability identifiers (Appendix D / §6).</summary>
    public required IReadOnlyList<string> Capabilities { get; init; }

    /// <summary>The advertised extension identifiers; MAY be empty (zero extensions is conformant) (R-29.5-a).</summary>
    public required IReadOnlyList<string> Extensions { get; init; }

    /// <summary>The implemented transports; at least one, each independently conformant (R-29.8-a).</summary>
    public required IReadOnlyList<string> Transports { get; init; }
  }

  /// <summary>A single way a <see cref="ConformanceProfile"/> fails to be well-formed.</summary>
  /// <param name="Field">Which profile field the violation concerns (<c>roles</c>/<c>revisions</c>/<c>capabilities</c>/<c>extensions</c>/<c>transports</c>).</param>
  /// <param name="Message">A human-readable description citing the requirement.</param>
  public readonly record struct ConformanceProfileViolation(string Field, string Message);

  /// <summary>Outcome of <see cref="ValidateConformanceProfile"/>.</summary>
  /// <param name="Ok"><c>true</c> when the profile is well-formed.</param>
  /// <param name="Violations">The accumulated violations (empty when <paramref name="Ok"/> is <c>true</c>).</param>
  public readonly record struct ConformanceProfileValidation(bool Ok, IReadOnlyList<ConformanceProfileViolation> Violations);

  /// <summary>
  /// Validates that a <see cref="ConformanceProfile"/> is well-formed against the structural
  /// requirements of §29 (spec §29.5 item 2, §29.8 item 1, §29.9 item 3, R-29.1-b, R-29.5-c, R-29.8-a,
  /// R-29.9-c). Accumulates ALL violations: at least one recognized role; non-empty revisions including
  /// <c>2026-07-28</c>; every extension identifier well-formed per §6 (an empty list is conformant); at
  /// least one transport. Capabilities are not constrained beyond being a list.
  /// </summary>
  /// <param name="profile">The profile to validate.</param>
  /// <returns>The validation outcome.</returns>
  public static ConformanceProfileValidation ValidateConformanceProfile(ConformanceProfile profile)
  {
    ArgumentNullException.ThrowIfNull(profile);
    var violations = new List<ConformanceProfileViolation>();

    if (profile.Roles.Count == 0)
    {
      violations.Add(new ConformanceProfileViolation("roles", "A profile must declare at least one role (client/server) (R-29.1-a)."));
    }

    if (profile.Revisions.Count == 0)
    {
      violations.Add(new ConformanceProfileViolation("revisions", "A profile must advertise at least one protocol revision (R-29.9-c)."));
    }
    if (!profile.Revisions.Contains(ProtocolRevision.Current, StringComparer.Ordinal))
    {
      violations.Add(new ConformanceProfileViolation(
        "revisions", $"Advertised revisions must include the wire value \"{ProtocolRevision.Current}\" (R-29.9-c)."));
    }

    foreach (var extension in profile.Extensions)
    {
      if (!Extensions.IsValidId(extension))
      {
        violations.Add(new ConformanceProfileViolation(
          "extensions", $"Extension identifier \"{extension}\" is not well-formed per §6 (R-29.5-c)."));
      }
    }

    if (profile.Transports.Count == 0)
    {
      violations.Add(new ConformanceProfileViolation(
        "transports", "A conformant implementation must implement at least one transport (R-29.8-a)."));
    }

    return new ConformanceProfileValidation(violations.Count == 0, violations);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="revision"/> is supported as a profile revision: it is the
  /// current wire value, or any revision the profile advertises (spec §29.9 item 3).
  /// </summary>
  /// <param name="profile">The conformance profile.</param>
  /// <param name="revision">The candidate revision.</param>
  /// <returns><c>true</c> when supported.</returns>
  public static bool ProfileSupportsRevision(ConformanceProfile profile, string revision)
  {
    ArgumentNullException.ThrowIfNull(profile);
    return ProtocolRevision.IsSupported(revision) || profile.Revisions.Contains(revision, StringComparer.Ordinal);
  }

  private static readonly IReadOnlyDictionary<string, string> CapabilityGuard =
    new Dictionary<string, string>(StringComparer.Ordinal)
    {
      ["R-29.4-b"] = "tools",
      ["R-29.4-c"] = "resources",
      ["R-29.4-d"] = "prompts",
      ["R-29.4-e"] = "completions",
      ["R-29.4-f"] = "elicitation",
    };

  /// <summary>
  /// Enumerates every normative requirement that APPLIES to a profile: every baseline requirement for
  /// the role(s) it plays, plus every transport requirement (spec §29.1, §29.9 item 1). The §29.4
  /// capability-conditioned atoms apply only when the relevant capability is advertised.
  /// </summary>
  /// <param name="profile">The conformance profile.</param>
  /// <returns>The exact obligation set for the implementation.</returns>
  public static IReadOnlyList<ConformanceRequirement> RequirementsForProfile(ConformanceProfile profile)
  {
    ArgumentNullException.ThrowIfNull(profile);
    var roleSet = new HashSet<Role>(profile.Roles);
    var advertised = new HashSet<string>(profile.Capabilities, StringComparer.Ordinal);
    var result = new List<ConformanceRequirement>();
    foreach (var r in All)
    {
      // Role-axis: applies only when the implementation plays a bound role.
      if (r.Roles.Count > 0 && !r.Roles.Any(roleSet.Contains)) continue;

      // §29.4 capability-conditioned feature atoms apply only when advertised.
      if (r.Section == "29.4" && CapabilityGuard.TryGetValue(r.Id, out var guardedCapability) &&
          !advertised.Contains(guardedCapability))
      {
        continue;
      }
      result.Add(r);
    }
    return result;
  }

  /// <summary>
  /// Returns <c>true</c> when an implementation satisfying ONLY one role's requirements is conformant
  /// for <paramref name="targetRole"/> (spec §29.1, R-29.1-a, R-29.1-b). A both-roles implementation
  /// must satisfy each role; satisfying only the other role's requirements is non-conformant.
  /// </summary>
  /// <param name="satisfiedRoles">The roles whose requirements the implementation provably satisfies.</param>
  /// <param name="targetRole">The role whose conformance is being judged.</param>
  /// <returns><c>true</c> when conformant for the target role.</returns>
  public static bool SatisfiesRole(IEnumerable<Role> satisfiedRoles, Role targetRole)
  {
    ArgumentNullException.ThrowIfNull(satisfiedRoles);
    return new HashSet<Role>(satisfiedRoles).Contains(targetRole);
  }

  // ─── §29.9 — No partial feature conformance ─────────────────────────────────────

  /// <summary>Outcome of <see cref="IsFeatureFullyConformant"/>.</summary>
  /// <param name="Ok"><c>true</c> unless the feature is advertised but not fully implemented.</param>
  /// <param name="AdvertisedNotImplemented"><c>true</c> when the feature is advertised but not implemented (the non-conformant intermediate state).</param>
  public readonly record struct FeatureConformance(bool Ok, bool AdvertisedNotImplemented);

  /// <summary>
  /// Enforces "no partial feature conformance": an implementation either fully satisfies the MUST-level
  /// behavior of an advertised feature or MUST NOT advertise it (spec §29.9 item 4, R-29.9-b; R-29.4-a,
  /// R-29.4-j). An UNadvertised feature that is not implemented is perfectly conformant.
  /// </summary>
  /// <param name="advertised">Whether the feature is advertised.</param>
  /// <param name="fullyImplemented">Whether every MUST-level behavior of the feature is implemented.</param>
  /// <returns>The conformance outcome.</returns>
  public static FeatureConformance IsFeatureFullyConformant(bool advertised, bool fullyImplemented) =>
    advertised && !fullyImplemented
      ? new FeatureConformance(false, true)
      : new FeatureConformance(true, false);

  // ─── §30 — Provenance-only references ───────────────────────────────────────────

  /// <summary>
  /// The status the §30 citation markers carry: provenance only, never load-bearing (spec §30,
  /// R-30-a). No normative behavior, code, name, or wire format depends on the content of any citation.
  /// </summary>
  /// <param name="LoadBearing">Always <c>false</c>: citations identify external sources but are never load-bearing.</param>
  /// <param name="SelfContained">Always <c>true</c>: all normative content is fully specified in the document body.</param>
  public readonly record struct CitationStatusInfo(bool LoadBearing, bool SelfContained);

  /// <summary>The §30 citation status (spec R-30-a): never load-bearing, always self-contained.</summary>
  public static CitationStatusInfo CitationStatus { get; } = new(false, true);

  /// <summary>
  /// Returns <c>false</c> always: no §30 citation marker is ever load-bearing (spec R-30-a). The answer
  /// is unconditionally "not load-bearing", independent of which marker is named.
  /// </summary>
  /// <param name="citationMarker">The citation marker (ignored).</param>
  /// <returns>Always <c>false</c>.</returns>
  public static bool IsCitationLoadBearing(string citationMarker) => false;
}
