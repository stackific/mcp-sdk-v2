using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

// ─── Revision selection & negotiation (§5.4–§5.7) ──────────────────────────────────────────────────

/// <summary>
/// Revision selection and the recovery paths for the two negotiation errors (spec §5.4–§5.7) — the C#
/// counterpart of the TypeScript <c>protocol/negotiation.ts</c> module. It turns the raw materials
/// discovery produces (a set of advertised revisions and capabilities) into a chosen protocol
/// revision, and defines what a client does when a request is rejected.
/// </summary>
/// <remarks>
/// <para>
/// The selection rule (§5.4) picks the highest <em>mutually</em> supported revision — the first in the
/// client's own ordered preference list that also appears in the server's set — using exact string
/// match, never lexical or chronological comparison (R-5.1-a, R-5.1-b). When the intersection is empty
/// the client MUST NOT fabricate a revision (R-5.4-c) and SHOULD surface an
/// <see cref="IncompatibleProtocolError"/> (R-5.4-d). The §5.7 backward-compatibility probe and the
/// per-endpoint <see cref="ProtocolSupportCache"/> live alongside it.
/// </para>
/// <para>
/// <c>server/discover</c> is OPTIONAL before a first substantive request (R-5.4-a): a client MAY probe
/// first, or proceed directly and handle an <c>UnsupportedProtocolVersion</c> rejection — the
/// re-selection path (<see cref="ReselectAfterUnsupportedVersion"/>) works without any prior discovery.
/// </para>
/// </remarks>
public static class RevisionNegotiation
{
  /// <summary>Both negotiation errors ride HTTP <c>400 Bad Request</c> on the HTTP transport (R-5.5-b, R-5.6-d).</summary>
  public const int NegotiationErrorHttpStatus = 400;

  /// <summary>
  /// Returns <c>400</c> when <paramref name="code"/> is one of the two negotiation error codes
  /// (<c>-32004</c>, <c>-32003</c>), which on the HTTP transport MUST ride a <c>400 Bad Request</c>;
  /// otherwise <c>null</c> (R-5.5-b, R-5.6-d). Mirrors TS <c>httpStatusForNegotiationError</c>.
  /// </summary>
  /// <param name="code">The JSON-RPC error code.</param>
  /// <returns><c>400</c> for a negotiation code, otherwise <c>null</c>.</returns>
  public static int? HttpStatusForNegotiationError(int code) =>
    code is ErrorCodes.UnsupportedProtocolVersion or ErrorCodes.MissingRequiredClientCapability
      ? NegotiationErrorHttpStatus
      : null;

  /// <summary>
  /// Selects a protocol revision from a server's <paramref name="supportedVersions"/> using the
  /// client's own preference order (§5.4, R-5.3.2-d) — never the order of the server's array. The
  /// first client-preferred revision the server also supports is chosen; reordering
  /// <paramref name="supportedVersions"/> cannot change the result. Returns <c>null</c> when the two
  /// share no revision. Mirrors TS <c>selectRevision</c>.
  /// </summary>
  /// <param name="supportedVersions">The server's advertised revisions (order ignored).</param>
  /// <param name="clientAcceptable">
  /// The client's acceptable revisions, most-preferred first. When <c>null</c>, defaults to
  /// <c>[ProtocolRevision.Current]</c>.
  /// </param>
  /// <returns>The selected revision, or <c>null</c> when the intersection is empty.</returns>
  public static string? SelectRevision(
    IReadOnlyList<string> supportedVersions,
    IReadOnlyList<string>? clientAcceptable = null)
  {
    ArgumentNullException.ThrowIfNull(supportedVersions);
    var preference = clientAcceptable ?? [ProtocolRevision.Current];
    var offered = new HashSet<string>(supportedVersions, StringComparer.Ordinal);
    foreach (var candidate in preference)
    {
      if (offered.Contains(candidate))
      {
        return candidate;
      }
    }
    return null;
  }

  /// <summary>
  /// Selects the highest mutually supported protocol revision, returning a structured outcome
  /// (§5.4, R-5.4-b). On an empty intersection the result carries both sides' revision sets so the
  /// caller can surface an <see cref="IncompatibleProtocolError"/> (R-5.4-c, R-5.4-d). Mirrors TS
  /// <c>negotiateRevision</c>.
  /// </summary>
  /// <param name="clientPreference">The client's acceptable revisions, most-preferred first.</param>
  /// <param name="serverSupported">The server's advertised revisions (order ignored).</param>
  /// <returns>An <see cref="RevisionNegotiationResult"/> describing the selection or the failure.</returns>
  public static RevisionNegotiationResult NegotiateRevision(
    IReadOnlyList<string> clientPreference,
    IReadOnlyList<string> serverSupported)
  {
    ArgumentNullException.ThrowIfNull(clientPreference);
    ArgumentNullException.ThrowIfNull(serverSupported);
    var selected = SelectRevision(serverSupported, clientPreference);
    return selected is null
      ? RevisionNegotiationResult.NoMutualRevision(clientPreference, serverSupported)
      : RevisionNegotiationResult.Selected(selected);
  }

  /// <summary>
  /// Reacts to an <c>UnsupportedProtocolVersion</c> (<c>-32004</c>) error by re-selecting a revision
  /// from the error's authoritative <c>data.supported</c> set (§5.5, R-5.5-h). Because this is a pure
  /// re-selection over the server's set, an empty result is terminal — the client MUST NOT retry
  /// indefinitely (R-5.5-i) and SHOULD surface an incompatibility (R-5.5-j). Mirrors TS
  /// <c>reselectAfterUnsupportedVersion</c>.
  /// </summary>
  /// <param name="error">The <c>-32004</c> error (its <c>data.supported</c> is used).</param>
  /// <param name="clientPreference">The client's acceptable revisions, most-preferred first.</param>
  /// <returns>The re-selection outcome.</returns>
  public static RevisionNegotiationResult ReselectAfterUnsupportedVersion(
    JsonRpcError error,
    IReadOnlyList<string> clientPreference)
  {
    ArgumentNullException.ThrowIfNull(error);
    ArgumentNullException.ThrowIfNull(clientPreference);
    var supported = ReadStringArray(error.Data, "supported");
    return NegotiateRevision(clientPreference, supported);
  }

  /// <summary>
  /// Returns <c>true</c> when the client can declare every capability the server named as required —
  /// each required top-level key is one the client already declares (§5.6, R-5.6-i). The comparison is
  /// by top-level key presence; capabilities are never inferred from a prior request. Mirrors TS
  /// <c>canSatisfyRequiredCapabilities</c>.
  /// </summary>
  /// <param name="requiredCapabilities">The error's <c>data.requiredCapabilities</c> object.</param>
  /// <param name="clientSupported">The capabilities the client is able to offer.</param>
  /// <returns><c>true</c> when the client can satisfy every required capability.</returns>
  public static bool CanSatisfyRequiredCapabilities(JsonObject requiredCapabilities, JsonObject clientSupported)
  {
    ArgumentNullException.ThrowIfNull(requiredCapabilities);
    ArgumentNullException.ThrowIfNull(clientSupported);
    foreach (var (key, _) in requiredCapabilities)
    {
      if (!clientSupported.ContainsKey(key))
      {
        return false;
      }
    }
    return true;
  }

  /// <summary>
  /// Produces the <c>clientCapabilities</c> object for a retry after a
  /// <c>MissingRequiredClientCapability</c> (<c>-32003</c>) error: the originally declared
  /// capabilities merged with the required ones (§5.6, R-5.6-i). The merge is shallow — a required
  /// capability replaces any previously declared value for that key — and never mutates its inputs.
  /// Mirrors TS <c>augmentClientCapabilities</c>.
  /// </summary>
  /// <param name="declared">The originally declared client capabilities.</param>
  /// <param name="requiredCapabilities">The capabilities the server named as required.</param>
  /// <returns>A fresh, merged <see cref="JsonObject"/>.</returns>
  public static JsonObject AugmentClientCapabilities(JsonObject declared, JsonObject requiredCapabilities)
  {
    ArgumentNullException.ThrowIfNull(declared);
    ArgumentNullException.ThrowIfNull(requiredCapabilities);
    var merged = new JsonObject();
    foreach (var (key, value) in declared) merged[key] = value?.DeepClone();
    foreach (var (key, value) in requiredCapabilities) merged[key] = value?.DeepClone();
    return merged;
  }

  // ─── Backward-compatibility probe (§5.7) ─────────────────────────────────────────────────────────

  /// <summary>The method a client sends as its opening probe request (R-5.7-b): <c>server/discover</c>.</summary>
  public const string ServerDiscoverMethod = McpMethods.Discover;

  /// <summary>
  /// Interprets a response to a probe <c>server/discover</c> request (§5.7), classifying it as
  /// <see cref="ProbeOutcomeKind.Supported"/>, <see cref="ProbeOutcomeKind.UnsupportedVersion"/>, or
  /// <see cref="ProbeOutcomeKind.NotThisProtocol"/>. Mirrors TS <c>interpretProbeResponse</c>.
  /// </summary>
  /// <remarks>
  /// A success carrying a valid <c>DiscoverResult</c> means the server speaks this protocol family. A
  /// recognized <c>-32004</c> whose <c>data</c> carries <c>supported</c> + <c>requested</c> means same
  /// family, different revision — the client re-selects from <c>data.supported</c>. Anything else (a
  /// different error code, a malformed response, or <c>null</c> for a timeout) means the server does
  /// not speak this protocol revision (R-5.7-c).
  /// </remarks>
  /// <param name="response">The raw JSON-RPC response node, or <c>null</c> for a timeout / no response.</param>
  /// <returns>The classified <see cref="ProbeOutcome"/>.</returns>
  public static ProbeOutcome InterpretProbeResponse(JsonNode? response)
  {
    if (response is not JsonObject obj)
    {
      return new ProbeOutcome.NotThisProtocol("no response (timeout) or non-object response");
    }

    // Success branch: a result carrying a valid DiscoverResult.
    if (obj.ContainsKey("result") && !obj.ContainsKey("error"))
    {
      if (obj["result"] is JsonObject resultObj && TryReadDiscoverResult(resultObj, out var supportedVersions, out var result))
      {
        return new ProbeOutcome.Supported([.. supportedVersions], result);
      }
      return new ProbeOutcome.NotThisProtocol("result is not a valid DiscoverResult");
    }

    // Error branch: only a recognized -32004 with data.supported + data.requested is "this protocol".
    if (obj["error"] is JsonObject error)
    {
      if (ReadInt(error, "code") == ErrorCodes.UnsupportedProtocolVersion &&
          error["data"] is JsonObject data &&
          data["supported"] is JsonArray &&
          data["requested"] is JsonValue requestedValue &&
          requestedValue.GetValueKind() == JsonValueKind.String)
      {
        var supported = ReadStringArray(data, "supported");
        return new ProbeOutcome.UnsupportedVersion([.. supported], requestedValue.GetValue<string>());
      }
      var codeText = error["code"]?.ToJsonString() ?? "null";
      return new ProbeOutcome.NotThisProtocol($"unrecognized error code {codeText}");
    }

    return new ProbeOutcome.NotThisProtocol("response is neither a result nor an error");
  }

  /// <summary>
  /// Adds the server's supported revisions to an error's <c>data.supported</c> so a peer with no
  /// fall-forward mechanism can still surface a useful diagnostic (§5.7, R-5.7-g). Existing <c>data</c>
  /// fields are preserved; <c>supported</c> is set/overwritten. Never mutates the input. Mirrors TS
  /// <c>nameSupportedRevisionsInError</c>.
  /// </summary>
  /// <param name="baseError">The error object to annotate.</param>
  /// <param name="supported">The protocol revisions the server supports.</param>
  /// <returns>A new <see cref="JsonRpcError"/> whose <c>data</c> carries <c>supported</c>.</returns>
  public static JsonRpcError NameSupportedRevisionsInError(JsonRpcError baseError, IReadOnlyList<string> supported)
  {
    ArgumentNullException.ThrowIfNull(baseError);
    ArgumentNullException.ThrowIfNull(supported);
    var data = baseError.Data is JsonObject existing ? (JsonObject)existing.DeepClone() : new JsonObject();
    var supportedArray = new JsonArray();
    foreach (var revision in supported) supportedArray.Add(revision);
    data["supported"] = supportedArray;
    return new JsonRpcError(baseError.Code, baseError.Message, data);
  }

  /// <summary>
  /// Derives a <see cref="ProtocolSupportDetermination"/> from a probe outcome, ready to cache (§5.7).
  /// Both <see cref="ProbeOutcomeKind.Supported"/> and <see cref="ProbeOutcomeKind.UnsupportedVersion"/>
  /// mean the server speaks this protocol family; <see cref="ProbeOutcomeKind.NotThisProtocol"/> means
  /// it does not (R-5.7-c). Mirrors TS <c>determinationFromProbe</c>.
  /// </summary>
  /// <param name="outcome">The classified probe outcome.</param>
  /// <returns>The cacheable determination.</returns>
  public static ProtocolSupportDetermination DeterminationFromProbe(ProbeOutcome outcome)
  {
    ArgumentNullException.ThrowIfNull(outcome);
    // Both family-speaking cases carry the supported set in a strongly-typed property, so pattern
    // matching extracts it without a nullable-bag dereference.
    return outcome switch
    {
      ProbeOutcome.Supported s => ProtocolSupportDetermination.Speaks(s.SupportedVersions),
      ProbeOutcome.UnsupportedVersion u => ProtocolSupportDetermination.Speaks(u.SupportedVersions),
      _ => ProtocolSupportDetermination.DoesNotSpeak,
    };
  }

  // ─── Internal JSON helpers ───────────────────────────────────────────────────────────────────────

  private static IReadOnlyList<string> ReadStringArray(JsonNode? container, string key)
  {
    if (container is JsonObject obj && obj[key] is JsonArray array)
    {
      var list = new List<string>(array.Count);
      foreach (var element in array)
      {
        if (element is JsonValue value && value.GetValueKind() == JsonValueKind.String)
        {
          list.Add(value.GetValue<string>());
        }
      }
      return list;
    }
    return [];
  }

  private static int? ReadInt(JsonObject obj, string key) =>
    obj[key] is JsonValue value && value.GetValueKind() == JsonValueKind.Number && value.TryGetValue<int>(out var i)
      ? i
      : null;

  private static bool TryReadDiscoverResult(JsonObject resultObj, out IReadOnlyList<string> supportedVersions, out DiscoverResult? result)
  {
    supportedVersions = [];
    result = null;

    // A valid DiscoverResult carries a non-empty supportedVersions string[], a capabilities object,
    // and a serverInfo with string name + version (§5.3.2). Mirrors the TS isDiscoverResult guard.
    if (resultObj["supportedVersions"] is not JsonArray versionsArray || versionsArray.Count == 0)
    {
      return false;
    }
    var versions = new List<string>(versionsArray.Count);
    foreach (var element in versionsArray)
    {
      if (element is JsonValue value && value.GetValueKind() == JsonValueKind.String)
      {
        versions.Add(value.GetValue<string>());
      }
      else
      {
        return false;
      }
    }

    if (resultObj["capabilities"] is not JsonObject) return false;
    if (resultObj["serverInfo"] is not JsonObject serverInfo) return false;
    if (serverInfo["name"] is not JsonValue nameValue || nameValue.GetValueKind() != JsonValueKind.String) return false;
    if (serverInfo["version"] is not JsonValue versionValue || versionValue.GetValueKind() != JsonValueKind.String) return false;

    try
    {
      result = resultObj.Deserialize<DiscoverResult>(McpJson.Options);
    }
    catch (JsonException)
    {
      return false;
    }
    if (result is null) return false;

    supportedVersions = versions;
    return true;
  }
}

/// <summary>Why §5.4 revision selection failed. The rule has a single failure mode.</summary>
public enum RevisionNegotiationFailure
{
  /// <summary>The client's preference list and the server's supported set share no revision (R-5.4-c).</summary>
  NoMutualRevision,
}

/// <summary>The two possible outcomes of the §5.4 revision-selection rule. Mirrors TS <c>RevisionNegotiationResult</c>.</summary>
public sealed record RevisionNegotiationResult
{
  private RevisionNegotiationResult() { }

  /// <summary><c>true</c> when a mutually supported revision was selected.</summary>
  public bool Ok { get; private init; }

  /// <summary>The selected revision when <see cref="Ok"/> is <c>true</c>; otherwise <c>null</c>.</summary>
  public string? SelectedRevision { get; private init; }

  /// <summary>
  /// The failure reason when <see cref="Ok"/> is <c>false</c> (the only value is
  /// <see cref="RevisionNegotiationFailure.NoMutualRevision"/>); <c>null</c> on success.
  /// </summary>
  public RevisionNegotiationFailure? Reason { get; private init; }

  /// <summary>The client's preference list, carried on failure for diagnostics; empty on success.</summary>
  public IReadOnlyList<string> ClientPreference { get; private init; } = [];

  /// <summary>The server's supported set, carried on failure for diagnostics; empty on success.</summary>
  public IReadOnlyList<string> ServerSupported { get; private init; } = [];

  /// <summary>Builds a successful selection result.</summary>
  /// <param name="selected">The chosen revision.</param>
  /// <returns>A successful result.</returns>
  public static RevisionNegotiationResult Selected(string selected) =>
    new() { Ok = true, SelectedRevision = selected };

  /// <summary>Builds a terminal "no mutual revision" failure carrying both sides' sets.</summary>
  /// <param name="clientPreference">The client's preference list.</param>
  /// <param name="serverSupported">The server's supported set.</param>
  /// <returns>A failure result.</returns>
  public static RevisionNegotiationResult NoMutualRevision(
    IReadOnlyList<string> clientPreference,
    IReadOnlyList<string> serverSupported) =>
    new()
    {
      Ok = false,
      Reason = RevisionNegotiationFailure.NoMutualRevision,
      ClientPreference = [.. clientPreference],
      ServerSupported = [.. serverSupported],
    };
}

/// <summary>
/// An actionable error a client surfaces to its caller when no protocol revision is mutually supported
/// (§5.4-d, §5.5-j). It carries both sides' revision sets for diagnostics and, unlike an
/// <see cref="McpError"/>, is NOT a wire error — it never goes on the wire. Mirrors TS
/// <c>IncompatibleProtocolError</c>.
/// </summary>
public sealed class IncompatibleProtocolError : Exception
{
  /// <summary>A stable, programmatic identifier for this error kind: <c>INCOMPATIBLE_PROTOCOL</c>.</summary>
  public string Code => "INCOMPATIBLE_PROTOCOL";

  /// <summary>The client's acceptable revisions, most-preferred first.</summary>
  public IReadOnlyList<string> ClientPreference { get; }

  /// <summary>The server's advertised revisions.</summary>
  public IReadOnlyList<string> ServerSupported { get; }

  /// <summary>Creates the error from both sides' revision sets.</summary>
  /// <param name="clientPreference">The client's acceptable revisions.</param>
  /// <param name="serverSupported">The server's advertised revisions.</param>
  public IncompatibleProtocolError(IReadOnlyList<string> clientPreference, IReadOnlyList<string> serverSupported)
    : base(
        $"No mutually supported protocol revision: client prefers [{string.Join(", ", clientPreference)}], " +
        $"server supports [{string.Join(", ", serverSupported)}]")
  {
    ClientPreference = [.. clientPreference];
    ServerSupported = [.. serverSupported];
  }
}

/// <summary>The three classes a probe (<c>server/discover</c>) response falls into (§5.7).</summary>
public enum ProbeOutcomeKind
{
  /// <summary>A valid <c>DiscoverResult</c>: the server speaks this protocol family.</summary>
  Supported,

  /// <summary>A recognized <c>-32004</c>: speaks the family, but not the requested revision.</summary>
  UnsupportedVersion,

  /// <summary>Anything else: the server does not speak this protocol revision.</summary>
  NotThisProtocol,
}

/// <summary>
/// The outcome of interpreting a probe (<c>server/discover</c>) response (§5.7). Mirrors TS
/// <c>ProbeOutcome</c>. Modeled as a closed record hierarchy — one derived type per
/// <see cref="ProbeOutcomeKind"/> carrying ONLY the data valid for that case — so illegal combinations
/// (for example a "not-this-protocol" outcome that nonetheless carries a parsed result) cannot be
/// constructed. Match on the concrete type with a <c>switch</c> expression, or branch on <see cref="Kind"/>.
/// </summary>
public abstract record ProbeOutcome
{
  // Closed hierarchy: only the nested derived records below may extend it.
  private protected ProbeOutcome() { }

  /// <summary>Which class the probe response fell into.</summary>
  public abstract ProbeOutcomeKind Kind { get; }

  /// <summary>
  /// A valid <c>DiscoverResult</c>: the server speaks this protocol family (§5.7).
  /// </summary>
  /// <param name="SupportedVersions">The result's advertised <c>supportedVersions</c>.</param>
  /// <param name="Result">The parsed discovery result, when one was deserialized.</param>
  public sealed record Supported(IReadOnlyList<string> SupportedVersions, DiscoverResult? Result) : ProbeOutcome
  {
    /// <inheritdoc/>
    public override ProbeOutcomeKind Kind => ProbeOutcomeKind.Supported;
  }

  /// <summary>
  /// A recognized <c>-32004</c>: the server speaks this protocol family, but not the requested revision (§5.7).
  /// </summary>
  /// <param name="SupportedVersions">The error's <c>data.supported</c> revisions.</param>
  /// <param name="Requested">The rejected revision.</param>
  public sealed record UnsupportedVersion(IReadOnlyList<string> SupportedVersions, string Requested) : ProbeOutcome
  {
    /// <inheritdoc/>
    public override ProbeOutcomeKind Kind => ProbeOutcomeKind.UnsupportedVersion;
  }

  /// <summary>
  /// Anything else (a different error code, malformed response, or timeout): the server does not speak
  /// this protocol revision (§5.7, R-5.7-c).
  /// </summary>
  /// <param name="Reason">A short explanation of why the response was not recognized.</param>
  public sealed record NotThisProtocol(string Reason) : ProbeOutcome
  {
    /// <inheritdoc/>
    public override ProbeOutcomeKind Kind => ProbeOutcomeKind.NotThisProtocol;
  }
}

/// <summary>
/// A per-endpoint conclusion about whether a server speaks this protocol family (§5.7). Mirrors TS
/// <c>ProtocolSupportDetermination</c>.
/// </summary>
public sealed record ProtocolSupportDetermination
{
  private ProtocolSupportDetermination() { }

  /// <summary><c>true</c> when the endpoint speaks this protocol family.</summary>
  public required bool SpeaksProtocol { get; init; }

  /// <summary>The endpoint's supported revisions when <see cref="SpeaksProtocol"/> is <c>true</c>; otherwise empty.</summary>
  public IReadOnlyList<string> SupportedVersions { get; init; } = [];

  /// <summary>A shared determination meaning the endpoint does not speak this protocol family.</summary>
  public static ProtocolSupportDetermination DoesNotSpeak { get; } = new() { SpeaksProtocol = false };

  /// <summary>Builds a positive determination carrying the endpoint's supported revisions.</summary>
  /// <param name="supportedVersions">The revisions the endpoint supports.</param>
  /// <returns>A positive determination.</returns>
  public static ProtocolSupportDetermination Speaks(IReadOnlyList<string> supportedVersions) =>
    new() { SpeaksProtocol = true, SupportedVersions = [.. supportedVersions] };
}

/// <summary>
/// Caches the protocol-support determination per server endpoint (§5.7, R-5.7-e). The determination is
/// a property of the endpoint, not of an individual request, so a client SHOULD cache it for the
/// lifetime of the connected server; it MAY persist it across restarts of the same server
/// configuration (via <see cref="Entries"/> / <see cref="FromEntries"/>) and re-probe — via
/// <see cref="Invalidate"/> — if a cached assumption later proves wrong (R-5.7-f). Mirrors TS
/// <c>ProtocolSupportCache</c>.
/// </summary>
/// <remarks>
/// Endpoints are identified by an opaque, caller-chosen key (for example a stdio command line or an
/// HTTP endpoint URL). This type is not thread-safe; guard it externally if shared across threads.
/// </remarks>
public sealed class ProtocolSupportCache
{
  private readonly Dictionary<string, ProtocolSupportDetermination> _determinations = new(StringComparer.Ordinal);

  /// <summary>Records a determination for <paramref name="endpoint"/>.</summary>
  /// <param name="endpoint">The opaque endpoint key.</param>
  /// <param name="determination">The determination to cache.</param>
  public void Set(string endpoint, ProtocolSupportDetermination determination)
  {
    ArgumentNullException.ThrowIfNull(endpoint);
    ArgumentNullException.ThrowIfNull(determination);
    _determinations[endpoint] = determination;
  }

  /// <summary>Returns the cached determination for <paramref name="endpoint"/>, or <c>null</c> when absent.</summary>
  /// <param name="endpoint">The opaque endpoint key.</param>
  /// <returns>The cached determination, or <c>null</c>.</returns>
  public ProtocolSupportDetermination? Get(string endpoint)
  {
    ArgumentNullException.ThrowIfNull(endpoint);
    return _determinations.TryGetValue(endpoint, out var determination) ? determination : null;
  }

  /// <summary>Returns <c>true</c> when a determination is cached for <paramref name="endpoint"/>.</summary>
  /// <param name="endpoint">The opaque endpoint key.</param>
  /// <returns><c>true</c> when cached.</returns>
  public bool Has(string endpoint)
  {
    ArgumentNullException.ThrowIfNull(endpoint);
    return _determinations.ContainsKey(endpoint);
  }

  /// <summary>Drops the cached determination so the client re-probes (R-5.7-f).</summary>
  /// <param name="endpoint">The opaque endpoint key.</param>
  public void Invalidate(string endpoint)
  {
    ArgumentNullException.ThrowIfNull(endpoint);
    _determinations.Remove(endpoint);
  }

  /// <summary>Snapshot of all cached determinations, for persistence (R-5.7-f).</summary>
  /// <returns>A list of (endpoint, determination) pairs.</returns>
  public IReadOnlyList<KeyValuePair<string, ProtocolSupportDetermination>> Entries() => [.. _determinations];

  /// <summary>Rebuilds a cache from persisted <see cref="Entries"/> (R-5.7-f).</summary>
  /// <param name="entries">The persisted (endpoint, determination) pairs.</param>
  /// <returns>A new cache populated from <paramref name="entries"/>.</returns>
  public static ProtocolSupportCache FromEntries(IEnumerable<KeyValuePair<string, ProtocolSupportDetermination>> entries)
  {
    ArgumentNullException.ThrowIfNull(entries);
    var cache = new ProtocolSupportCache();
    foreach (var (endpoint, determination) in entries)
    {
      cache.Set(endpoint, determination);
    }
    return cache;
  }
}

// ─── Capability negotiation (§6.1–§6.4) ────────────────────────────────────────────────────────────

/// <summary>
/// The per-request, stateless capability-negotiation rules that gate every optional feature
/// (spec §6.1–§6.4) — the C# counterpart of the TypeScript <c>protocol/capability-negotiation.ts</c>
/// module. Because MCP is stateless, a feature is usable only when BOTH peers declare the governing
/// capability/sub-flag, and capabilities are read from the current request only — never inferred from
/// a prior request (R-6.4-c).
/// </summary>
/// <remarks>
/// The predicates here read raw <see cref="JsonObject"/> capability maps (mirroring the TS
/// <c>Record&lt;string,unknown&gt;</c> inputs) so they apply uniformly to capabilities arriving on the
/// wire, before they are projected onto the typed <see cref="ClientCapabilities"/> /
/// <see cref="ServerCapabilities"/> records. The typed records also expose equivalent
/// <c>Supports*</c> / <c>Declares*</c> accessors for callers that already hold a parsed record.
/// </remarks>
public static class CapabilityNegotiation
{
  /// <summary>Client capabilities marked Deprecated; new implementations SHOULD NOT rely on them (R-6.2-j, R-6.2-m).</summary>
  public static IReadOnlySet<string> DeprecatedClientCapabilities { get; } =
    new HashSet<string>(StringComparer.Ordinal) { "roots", "sampling" };

  /// <summary>Server capabilities marked Deprecated; new implementations SHOULD NOT rely on them (R-6.3-q).</summary>
  public static IReadOnlySet<string> DeprecatedServerCapabilities { get; } =
    new HashSet<string>(StringComparer.Ordinal) { "logging" };

  /// <summary>Returns <c>true</c> when <paramref name="name"/> is a Deprecated client capability. Mirrors TS <c>isDeprecatedClientCapability</c>.</summary>
  /// <param name="name">The capability name.</param>
  /// <returns><c>true</c> when deprecated.</returns>
  public static bool IsDeprecatedClientCapability(string name) => DeprecatedClientCapabilities.Contains(name);

  /// <summary>Returns <c>true</c> when <paramref name="name"/> is a Deprecated server capability. Mirrors TS <c>isDeprecatedServerCapability</c>.</summary>
  /// <param name="name">The capability name.</param>
  /// <returns><c>true</c> when deprecated.</returns>
  public static bool IsDeprecatedServerCapability(string name) => DeprecatedServerCapabilities.Contains(name);

  /// <summary>
  /// Returns <c>true</c> when the client's raw capability map declares <paramref name="capability"/>
  /// (§6.1). Presence of an object means supported; <c>elicitation.form</c> is the implicit baseline
  /// (true whenever <c>elicitation</c> is present, R-6.2-e), while <c>elicitation.url</c>,
  /// <c>sampling.context</c>, and <c>sampling.tools</c> require their own sub-flag object. Mirrors TS
  /// <c>clientDeclares</c>.
  /// </summary>
  /// <param name="caps">The raw client capabilities map.</param>
  /// <param name="capability">A capability name or dotted sub-flag path (for example <c>elicitation.url</c>).</param>
  /// <returns><c>true</c> when declared.</returns>
  public static bool ClientDeclares(JsonObject caps, string capability)
  {
    ArgumentNullException.ThrowIfNull(caps);
    return capability switch
    {
      "experimental" => IsObject(caps, "experimental"),
      "elicitation" => IsObject(caps, "elicitation"),
      // Implicit baseline: elicitation present ⇒ form supported (explicit or not).
      "elicitation.form" => IsObject(caps, "elicitation"),
      "elicitation.url" => Nested(caps, "elicitation") is { } e && IsObject(e, "url"),
      "roots" => IsObject(caps, "roots"),
      "sampling" => IsObject(caps, "sampling"),
      "sampling.context" => Nested(caps, "sampling") is { } s && IsObject(s, "context"),
      "sampling.tools" => Nested(caps, "sampling") is { } s && IsObject(s, "tools"),
      "extensions" => IsObject(caps, "extensions"),
      _ => false,
    };
  }

  /// <summary>
  /// Returns <c>true</c> when the server's raw capability map declares <paramref name="capability"/>
  /// (§6.2). Object capabilities are declared by presence; the boolean sub-flags
  /// (<c>listChanged</c>, <c>subscribe</c>) are declared only when explicitly <c>true</c> — absent or
  /// <c>false</c> means not declared (R-6.3-h, R-6.3-l, R-6.3-o). Mirrors TS <c>serverDeclares</c>.
  /// </summary>
  /// <param name="caps">The raw server capabilities map.</param>
  /// <param name="capability">A capability name or dotted sub-flag path (for example <c>tools.listChanged</c>).</param>
  /// <returns><c>true</c> when declared.</returns>
  public static bool ServerDeclares(JsonObject caps, string capability)
  {
    ArgumentNullException.ThrowIfNull(caps);
    return capability switch
    {
      "experimental" => IsObject(caps, "experimental"),
      "completions" => IsObject(caps, "completions"),
      "prompts" => IsObject(caps, "prompts"),
      "prompts.listChanged" => SubFlagTrue(caps, "prompts", "listChanged"),
      "resources" => IsObject(caps, "resources"),
      "resources.subscribe" => SubFlagTrue(caps, "resources", "subscribe"),
      "resources.listChanged" => SubFlagTrue(caps, "resources", "listChanged"),
      "tools" => IsObject(caps, "tools"),
      "tools.listChanged" => SubFlagTrue(caps, "tools", "listChanged"),
      "logging" => IsObject(caps, "logging"),
      "extensions" => IsObject(caps, "extensions"),
      _ => false,
    };
  }

  /// <summary>Maps a server method to the <see cref="ServerCapabilities"/> field that gates it (§6.2, §6.3). Mirrors TS <c>SERVER_METHOD_CAPABILITY</c>.</summary>
  public static IReadOnlyDictionary<string, string> ServerMethodCapability { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
  {
    [McpMethods.CompletionComplete] = "completions",
    [McpMethods.PromptsList] = "prompts",
    [McpMethods.PromptsGet] = "prompts",
    [McpMethods.ResourcesList] = "resources",
    [McpMethods.ResourcesRead] = "resources",
    [McpMethods.ToolsList] = "tools",
    [McpMethods.ToolsCall] = "tools",
  };

  /// <summary>
  /// Returns the capability that gates <paramref name="method"/>, or <c>null</c> for an ungated (core)
  /// method. Mirrors TS <c>serverMethodRequiredCapability</c>.
  /// </summary>
  /// <param name="method">The method name.</param>
  /// <returns>The gating capability name, or <c>null</c>.</returns>
  public static string? ServerMethodRequiredCapability(string method)
  {
    ArgumentNullException.ThrowIfNull(method);
    return ServerMethodCapability.TryGetValue(method, out var capability) ? capability : null;
  }

  /// <summary>
  /// Returns <c>true</c> when a client MAY invoke <paramref name="method"/> given the server's declared
  /// capabilities (R-6.3-e, R-6.4-f, R-6.4-g). An ungated core method is always invocable; a gated
  /// method requires its governing capability to be declared. Mirrors TS <c>mayClientInvoke</c>.
  /// </summary>
  /// <param name="method">The method the client wants to invoke.</param>
  /// <param name="serverCaps">The server's declared capabilities (from the most recent discovery).</param>
  /// <returns><c>true</c> when invocation is permitted.</returns>
  public static bool MayClientInvoke(string method, JsonObject serverCaps)
  {
    ArgumentNullException.ThrowIfNull(method);
    ArgumentNullException.ThrowIfNull(serverCaps);
    var required = ServerMethodRequiredCapability(method);
    return required is null || ServerDeclares(serverCaps, required);
  }

  /// <summary>Maps a server-to-client notification to the capability/sub-flag that gates it (§6.2, §6.3). Mirrors TS <c>NOTIFICATION_REQUIRED_CAPABILITY</c>.</summary>
  public static IReadOnlyDictionary<string, string> NotificationRequiredCapabilityMap { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
  {
    [McpMethods.NotificationsPromptsListChanged] = "prompts.listChanged",
    [McpMethods.NotificationsResourcesListChanged] = "resources.listChanged",
    [McpMethods.NotificationsResourcesUpdated] = "resources.subscribe",
    [McpMethods.NotificationsToolsListChanged] = "tools.listChanged",
    [McpMethods.NotificationsMessage] = "logging",
  };

  /// <summary>
  /// Returns the capability/sub-flag that gates <paramref name="notification"/>, or <c>null</c> for an
  /// ungated one. Mirrors TS <c>notificationRequiredCapability</c>.
  /// </summary>
  /// <param name="notification">The notification name.</param>
  /// <returns>The gating capability/sub-flag, or <c>null</c>.</returns>
  public static string? NotificationRequiredCapability(string notification)
  {
    ArgumentNullException.ThrowIfNull(notification);
    return NotificationRequiredCapabilityMap.TryGetValue(notification, out var capability) ? capability : null;
  }

  /// <summary>
  /// Returns <c>true</c> when a client should expect <paramref name="notification"/> given the server's
  /// declared capabilities. When the gating sub-flag is absent or <c>false</c>, the client MUST NOT
  /// expect the notification (R-6.3-h, R-6.3-l, R-6.3-o). Mirrors TS <c>clientShouldExpectNotification</c>.
  /// </summary>
  /// <param name="notification">The notification name.</param>
  /// <param name="serverCaps">The server's declared capabilities.</param>
  /// <returns><c>true</c> when the notification may be expected.</returns>
  public static bool ClientShouldExpectNotification(string notification, JsonObject serverCaps)
  {
    ArgumentNullException.ThrowIfNull(notification);
    ArgumentNullException.ThrowIfNull(serverCaps);
    var required = NotificationRequiredCapability(notification);
    return required is null || ServerDeclares(serverCaps, required);
  }

  /// <summary>
  /// Returns the subset of <paramref name="required"/> capabilities not present in
  /// <paramref name="declared"/> (compared by top-level key presence; capabilities are never inferred
  /// from a prior request) (R-6.4-c, R-6.4-d, R-6.4-h). The returned object's values are deep-cloned
  /// from <paramref name="required"/>. Mirrors TS <c>computeMissingClientCapabilities</c>.
  /// </summary>
  /// <param name="declared">The capabilities declared on the current request.</param>
  /// <param name="required">The capabilities the server needs.</param>
  /// <returns>A fresh object listing exactly the required-but-undeclared capabilities.</returns>
  public static JsonObject ComputeMissingClientCapabilities(JsonObject declared, JsonObject required)
  {
    ArgumentNullException.ThrowIfNull(declared);
    ArgumentNullException.ThrowIfNull(required);
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

  /// <summary>
  /// Gates a request against the capabilities it requires (§6.4, R-6.4-h). Returns <c>null</c> when
  /// every required capability is declared (the request is allowed); otherwise returns the <c>-32003</c>
  /// <c>MissingRequiredClientCapability</c> error whose <c>data.requiredCapabilities</c> lists exactly
  /// the required-but-undeclared capabilities. Mirrors TS <c>gateRequiredClientCapabilities</c>.
  /// </summary>
  /// <param name="declared">The capabilities from the current request's <c>_meta</c>.</param>
  /// <param name="required">The capabilities the server needs to process the request.</param>
  /// <returns>The blocking <c>-32003</c> error, or <c>null</c> when the request is allowed.</returns>
  public static JsonRpcError? GateRequiredClientCapabilities(JsonObject declared, JsonObject required)
  {
    ArgumentNullException.ThrowIfNull(declared);
    ArgumentNullException.ThrowIfNull(required);
    var missing = ComputeMissingClientCapabilities(declared, required);
    return missing.Count == 0
      ? null
      : McpError.MissingRequiredClientCapability(missing).ToJsonRpcError();
  }

  /// <summary>Capability-negotiation errors ride HTTP <c>400 Bad Request</c> (R-6.4-i, R-6.4-k).</summary>
  public const int CapabilityErrorHttpStatus = 400;

  /// <summary>
  /// Returns <c>400</c> for the capability-negotiation error codes — <c>-32003</c> (missing required
  /// client capability) and <c>-32602</c> (malformed request omitting a required <c>_meta</c> field) —
  /// otherwise <c>null</c> (R-6.4-i, R-6.4-k). Mirrors TS <c>httpStatusForCapabilityError</c>.
  /// </summary>
  /// <param name="code">The JSON-RPC error code.</param>
  /// <returns><c>400</c> for a capability-negotiation code, otherwise <c>null</c>.</returns>
  public static int? HttpStatusForCapabilityError(int code) =>
    code is ErrorCodes.MissingRequiredClientCapability or ErrorCodes.InvalidParams
      ? CapabilityErrorHttpStatus
      : null;

  /// <summary>A server MUST NOT use URL-mode elicitation unless <c>elicitation.url</c> is present (R-6.2-g). Mirrors TS <c>mayUseUrlElicitation</c>.</summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <returns><c>true</c> when URL-mode elicitation is permitted.</returns>
  public static bool MayUseUrlElicitation(JsonObject clientCaps) => ClientDeclares(clientCaps, "elicitation.url");

  /// <summary>A server MUST NOT supply sampling <c>tools</c>/<c>toolChoice</c> unless <c>sampling.tools</c> is present (R-6.2-q). Mirrors TS <c>mayUseSamplingTools</c>.</summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <returns><c>true</c> when sampling tools may be supplied.</returns>
  public static bool MayUseSamplingTools(JsonObject clientCaps) => ClientDeclares(clientCaps, "sampling.tools");

  /// <summary>A server MUST NOT invoke <c>roots/list</c> unless <c>roots</c> is present (R-6.2-i). Mirrors TS <c>mayInvokeRootsList</c>.</summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <returns><c>true</c> when <c>roots/list</c> may be invoked.</returns>
  public static bool MayInvokeRootsList(JsonObject clientCaps) => ClientDeclares(clientCaps, "roots");

  /// <summary>A server MUST NOT invoke <c>sampling/createMessage</c> unless <c>sampling</c> is present (R-6.2-l). Mirrors TS <c>mayInvokeSampling</c>.</summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <returns><c>true</c> when sampling may be invoked.</returns>
  public static bool MayInvokeSampling(JsonObject clientCaps) => ClientDeclares(clientCaps, "sampling");

  /// <summary>
  /// Returns whether a server MAY use a given <c>includeContext</c> value during sampling, given the
  /// client's capabilities (R-6.2-o). When <c>sampling.context</c> is absent the server SHOULD use only
  /// <c>"none"</c> (or omit the field); when present, any value is allowed. Mirrors TS
  /// <c>mayUseIncludeContext</c>.
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities.</param>
  /// <param name="value">The <c>includeContext</c> value, or <c>null</c> when omitted.</param>
  /// <returns><c>true</c> when the value is permitted.</returns>
  public static bool MayUseIncludeContext(JsonObject clientCaps, string? value)
  {
    ArgumentNullException.ThrowIfNull(clientCaps);
    if (value is null || string.Equals(value, "none", StringComparison.Ordinal))
    {
      return true;
    }
    return ClientDeclares(clientCaps, "sampling.context");
  }

  /// <summary>
  /// Decides how to handle an operation when the other peer may not declare the optional behavior it
  /// would use (R-6.4-l, R-6.4-m): <see cref="DegradationDecision.Proceed"/> when the peer declares it,
  /// <see cref="DegradationDecision.Fallback"/> when it does not but the behavior is optional, and
  /// <see cref="DegradationDecision.Reject"/> only when the missing behavior is mandatory. A peer MUST
  /// NOT reject merely because the other declared fewer capabilities (R-6.4-m). Mirrors TS
  /// <c>decideDegradation</c>.
  /// </summary>
  /// <param name="peerDeclaresBehavior">Whether the other peer declared the optional behavior.</param>
  /// <param name="behaviorMandatory">Whether the behavior is mandatory for the operation.</param>
  /// <returns>The degradation decision.</returns>
  public static DegradationDecision DecideDegradation(bool peerDeclaresBehavior, bool behaviorMandatory)
  {
    if (peerDeclaresBehavior) return DegradationDecision.Proceed;
    return behaviorMandatory ? DegradationDecision.Reject : DegradationDecision.Fallback;
  }

  // ─── Internal JSON helpers ───────────────────────────────────────────────────────────────────────

  private static bool IsObject(JsonObject obj, string key) => obj[key] is JsonObject;

  private static JsonObject? Nested(JsonObject obj, string key) => obj[key] as JsonObject;

  private static bool SubFlagTrue(JsonObject obj, string parent, string flag) =>
    Nested(obj, parent) is { } p &&
    p[flag] is JsonValue value &&
    value.GetValueKind() == JsonValueKind.True;
}

/// <summary>What a peer should do when the other peer lacks an optional behavior (§6.4). Mirrors TS <c>DegradationDecision</c>.</summary>
public enum DegradationDecision
{
  /// <summary>The peer declares the behavior — use the optional behavior.</summary>
  Proceed,

  /// <summary>The peer does not, but the behavior is optional — use mutually supported core behavior.</summary>
  Fallback,

  /// <summary>The peer does not and the behavior is mandatory — reject the operation.</summary>
  Reject,
}
