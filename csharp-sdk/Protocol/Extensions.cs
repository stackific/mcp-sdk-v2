using System.Text.RegularExpressions;
using System.Text.Json.Nodes;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// S11 — The Extensions Map &amp; Forward Compatibility (spec §6.5–§6.7) combined with
/// S38 — The Extension Mechanism (spec §24).
/// </summary>
/// <remarks>
/// <para>
/// S11 owns the lexical layer: the extension-identifier grammar (<c>prefix/name</c>, with a
/// REQUIRED prefix — distinct from the OPTIONAL-prefix <c>_meta</c>-key grammar in
/// <see cref="Stackific.Mcp.Json.MetaKeys"/>), the <c>extensions</c> map / settings-object shapes,
/// normalization (dropping <c>null</c>/malformed entries per R-6.5-j), the activation-by-intersection
/// primitive, and the forward-compatibility helpers. S38 builds the mechanism on top: the
/// third-party reservation policy including the bare-token prohibition, per-request active-set
/// computation, the four sanctioned surface channels, method/notification namespacing, controlled
/// reserved <c>_meta</c> keys, the open <c>resultType</c> set, versioning, graceful degradation, the
/// declarative <see cref="ExtensionDefinition"/> validator, and the active-set-gated
/// <see cref="ExtensionMethodRouter"/>.
/// </para>
/// <para>
/// Raw <c>extensions</c> maps are modeled here as <see cref="JsonObject"/> (the wire shape: a map
/// from extension identifier to a settings object), because forward compatibility requires
/// tolerating arbitrary (possibly malformed: <c>null</c>, array, scalar) values without rejecting
/// the whole map. A receiver normalizes such a map with <see cref="Extensions.NormalizeMap"/>.
/// </para>
/// <para>
/// <b>Cross-file integration note.</b> <c>Protocol/Capabilities.cs</c> currently exposes
/// <c>HasExtension(id)</c> as a bare <c>ContainsKey</c> over its raw extensions dictionary, which
/// treats a <c>null</c>- or array-valued entry as advertised — a conformance bug versus R-6.5-j.
/// It SHOULD route advertisement/intersection checks through <see cref="Extensions.IsAdvertised"/>,
/// <see cref="Extensions.NormalizeMap"/>, and <see cref="Extensions.Intersect"/> defined here.
/// </para>
/// </remarks>
public static partial class Extensions
{
  // ─── Identifier grammar (§6.5, R-6.5-a – R-6.5-f) ──────────────────────────────

  /// <summary>Labels that make a prefix reserved when they appear as the SECOND label (R-6.5-g).</summary>
  private static readonly HashSet<string> ReservedSecondLabels =
    new(StringComparer.Ordinal) { "modelcontextprotocol", "mcp" };

  /// <summary>The bare single-label tokens reserved to the core protocol; a third party MUST NOT use either as a vendor prefix (R-24.2-f).</summary>
  private static readonly HashSet<string> ReservedBareVendorTokens =
    new(StringComparer.Ordinal) { "modelcontextprotocol", "mcp" };

  // A prefix label MUST start with a letter and end with a letter or digit; interior characters
  // MAY be letters, digits, or hyphens. A single-letter label is valid.
  [GeneratedRegex(@"^[A-Za-z]([A-Za-z0-9-]*[A-Za-z0-9])?$")]
  private static partial Regex PrefixLabelRegex();

  // A non-empty extension name begins and ends with an alphanumeric character; interior characters
  // MAY be hyphens, underscores, dots, or alphanumerics.
  [GeneratedRegex(@"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$")]
  private static partial Regex NameRegex();

  /// <summary>
  /// Returns <c>true</c> when <paramref name="prefix"/> is a syntactically valid extension-identifier
  /// prefix: one or more dot-separated valid labels (spec R-6.5-a – R-6.5-c). Reverse-DNS notation is
  /// RECOMMENDED but not enforced (R-6.5-d).
  /// </summary>
  /// <param name="prefix">The prefix (everything before the first slash).</param>
  /// <returns><c>true</c> when every dot-separated label is well-formed.</returns>
  public static bool IsValidPrefix(string prefix)
  {
    ArgumentNullException.ThrowIfNull(prefix);
    if (prefix.Length == 0) return false;
    foreach (var label in prefix.Split('.'))
    {
      if (!PrefixLabelRegex().IsMatch(label)) return false;
    }
    return true;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="name"/> is a valid extension name (the part after the
  /// slash). An empty name is permitted (spec R-6.5-e, R-6.5-f).
  /// </summary>
  /// <param name="name">The candidate name.</param>
  /// <returns><c>true</c> when the name is empty or well-formed.</returns>
  public static bool IsValidName(string name)
  {
    ArgumentNullException.ThrowIfNull(name);
    return name.Length == 0 || NameRegex().IsMatch(name);
  }

  /// <summary>The parsed parts of an extension identifier.</summary>
  /// <param name="Prefix">The prefix (everything before the FIRST slash), without the slash.</param>
  /// <param name="Name">The name (everything after the first slash); MAY be empty.</param>
  public readonly record struct ParsedExtensionId(string Prefix, string Name);

  /// <summary>
  /// Splits an extension identifier at its FIRST slash into prefix and name (spec R-6.5-a). Returns
  /// <c>null</c> when the string contains no slash at all — an identifier without a separating slash
  /// has no prefix and is malformed. Later slashes are retained in the name so
  /// <see cref="IsValidName"/> rejects them.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns>The parsed parts, or <c>null</c> when there is no slash.</returns>
  public static ParsedExtensionId? ParseId(string identifier)
  {
    ArgumentNullException.ThrowIfNull(identifier);
    var slash = identifier.IndexOf('/');
    if (slash < 0) return null;
    return new ParsedExtensionId(identifier[..slash], identifier[(slash + 1)..]);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="identifier"/> is a well-formed extension identifier: a
  /// REQUIRED prefix, a single separating slash, and a (possibly empty) name, each conforming to the
  /// §6.5 grammar (spec R-6.5-a, R-6.5-b, R-6.5-e, R-6.5-f). Well-formedness is independent of whether
  /// the prefix is reserved.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns><c>true</c> when well-formed.</returns>
  public static bool IsValidId(string identifier)
  {
    var parsed = ParseId(identifier);
    if (parsed is null) return false;
    return IsValidPrefix(parsed.Value.Prefix) && IsValidName(parsed.Value.Name);
  }

  // ─── Reserved prefixes (§6.5, R-6.5-g) ─────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="prefix"/> is reserved for official MCP use — i.e. its
  /// SECOND label is <c>modelcontextprotocol</c> or <c>mcp</c> (spec R-6.5-g). A prefix is NOT
  /// reserved merely because those tokens appear as some other label: <c>com.example.mcp</c> is not
  /// reserved (its second label is <c>example</c>), whereas <c>io.modelcontextprotocol</c>,
  /// <c>dev.mcp</c>, and <c>com.mcp</c> are.
  /// </summary>
  /// <param name="prefix">The identifier prefix.</param>
  /// <returns><c>true</c> when the second label is reserved.</returns>
  public static bool IsReservedPrefix(string prefix)
  {
    ArgumentNullException.ThrowIfNull(prefix);
    var labels = prefix.Split('.');
    return labels.Length >= 2 && ReservedSecondLabels.Contains(labels[1]);
  }

  /// <summary>
  /// Returns <c>true</c> when a THIRD PARTY may define an extension under <paramref name="identifier"/>
  /// per the S11 second-label rule — the identifier must be well-formed and its prefix must not be
  /// reserved (spec R-6.5-g). A malformed identifier is not third-party usable. (This is the lexical
  /// S11 check; the full S38 policy in <see cref="ValidateThirdPartyId"/> additionally rejects the
  /// bare reserved tokens.)
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns><c>true</c> when a third party may use it.</returns>
  public static bool IsThirdPartyUsable(string identifier)
  {
    var parsed = ParseId(identifier);
    if (parsed is null) return false;
    if (!IsValidPrefix(parsed.Value.Prefix) || !IsValidName(parsed.Value.Name)) return false;
    return !IsReservedPrefix(parsed.Value.Prefix);
  }

  // ─── §24.2 — Third-party identifier policy (whole-identifier rules) ─────────────

  /// <summary>
  /// Returns <c>true</c> when a vendor prefix is one of the bare reserved tokens
  /// <c>modelcontextprotocol</c> or <c>mcp</c> (a single-label prefix with no dot) (spec R-24.2-f).
  /// This is distinct from <see cref="IsReservedPrefix"/>, which reserves a prefix whose
  /// <em>second</em> label is reserved; a bare single-label prefix has no second label, so that check
  /// alone would miss <c>modelcontextprotocol/x</c> and <c>mcp/x</c>.
  /// </summary>
  /// <param name="prefix">The candidate vendor prefix.</param>
  /// <returns><c>true</c> when the prefix is a bare reserved token.</returns>
  public static bool IsReservedBareVendorPrefix(string prefix)
  {
    ArgumentNullException.ThrowIfNull(prefix);
    return ReservedBareVendorTokens.Contains(prefix);
  }

  /// <summary>Why a third party may not use an extension identifier (spec §24.2).</summary>
  public enum ThirdPartyIdRejection
  {
    /// <summary>No <c>/</c>-terminated vendor prefix — a bare name (R-24.2-a).</summary>
    MissingPrefix,

    /// <summary>A prefix label or the name breaks the lexical grammar (R-24.2-b, R-24.2-d).</summary>
    Malformed,

    /// <summary>The prefix's second label is <c>modelcontextprotocol</c>/<c>mcp</c> (R-24.2-e).</summary>
    ReservedPrefix,

    /// <summary>The bare token <c>modelcontextprotocol</c>/<c>mcp</c> used as the prefix (R-24.2-f).</summary>
    ReservedBareToken,
  }

  /// <summary>Outcome of <see cref="ValidateThirdPartyId"/>.</summary>
  /// <param name="Ok"><c>true</c> when the identifier is usable by a third party.</param>
  /// <param name="Reason">The specific rejection reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct ThirdPartyIdValidation(bool Ok, ThirdPartyIdRejection? Reason)
  {
    /// <summary>A successful validation.</summary>
    public static ThirdPartyIdValidation Success { get; } = new(true, null);

    /// <summary>Builds a failed validation carrying <paramref name="reason"/>.</summary>
    /// <param name="reason">The rejection reason.</param>
    /// <returns>A failed validation.</returns>
    public static ThirdPartyIdValidation Fail(ThirdPartyIdRejection reason) => new(false, reason);
  }

  /// <summary>
  /// Validates an extension identifier <em>as a third-party identifier</em>, returning the specific
  /// reason on failure (spec R-24.2-a, R-24.2-b, R-24.2-d, R-24.2-e, R-24.2-f). A third-party
  /// identifier MUST include a <c>/</c>-terminated vendor prefix, have every prefix label and the name
  /// conform to the §24.2 grammar, and NOT use a reserved prefix — neither one whose second label is
  /// <c>modelcontextprotocol</c>/<c>mcp</c> nor the bare tokens used as a single-label prefix.
  /// Identifiers are compared octet-for-octet; case folding is never applied (R-24.2-g).
  /// </summary>
  /// <param name="identifier">The candidate third-party identifier.</param>
  /// <returns>The validation outcome.</returns>
  public static ThirdPartyIdValidation ValidateThirdPartyId(string identifier)
  {
    var parsed = ParseId(identifier);
    if (parsed is null) return ThirdPartyIdValidation.Fail(ThirdPartyIdRejection.MissingPrefix);
    if (parsed.Value.Prefix.Length == 0) return ThirdPartyIdValidation.Fail(ThirdPartyIdRejection.MissingPrefix);
    if (!IsValidPrefix(parsed.Value.Prefix) || !IsValidName(parsed.Value.Name))
    {
      return ThirdPartyIdValidation.Fail(ThirdPartyIdRejection.Malformed);
    }
    if (IsReservedBareVendorPrefix(parsed.Value.Prefix))
    {
      return ThirdPartyIdValidation.Fail(ThirdPartyIdRejection.ReservedBareToken);
    }
    if (IsReservedPrefix(parsed.Value.Prefix))
    {
      return ThirdPartyIdValidation.Fail(ThirdPartyIdRejection.ReservedPrefix);
    }
    return ThirdPartyIdValidation.Success;
  }

  /// <summary>
  /// Returns <c>true</c> when a THIRD PARTY may define an extension under <paramref name="identifier"/>:
  /// well-formed, not under a reserved second-label prefix, and not using a bare reserved vendor token
  /// (spec R-24.2-a..f). Unlike <see cref="IsThirdPartyUsable"/>, this additionally rejects the bare
  /// tokens <c>modelcontextprotocol</c>/<c>mcp</c> as single-label prefixes (R-24.2-f).
  /// </summary>
  /// <param name="identifier">The candidate third-party identifier.</param>
  /// <returns><c>true</c> when usable by a third party under the full §24.2 policy.</returns>
  public static bool IsValidThirdPartyId(string identifier) => ValidateThirdPartyId(identifier).Ok;

  /// <summary>
  /// Compares two extension identifiers octet-for-octet, applying NO case folding (spec R-24.2-g).
  /// </summary>
  /// <param name="a">The first identifier.</param>
  /// <param name="b">The second identifier.</param>
  /// <returns><c>true</c> only when the strings are byte-identical.</returns>
  public static bool IdsMatch(string a, string b) => string.Equals(a, b, StringComparison.Ordinal);

  // ─── §24.1 — Classification ────────────────────────────────────────────────────

  /// <summary>
  /// The three (non-exclusive) ways an extension may be characterized (spec §24.1, R-24.1-a). Purely
  /// descriptive; does not affect negotiation.
  /// </summary>
  public enum ExtensionClassification
  {
    /// <summary>A discrete capability.</summary>
    Modular,

    /// <summary>Domain- or industry-specific behavior.</summary>
    Specialized,

    /// <summary>Incubated for possible future inclusion in the core.</summary>
    Experimental,
  }

  /// <summary>The full set of valid <see cref="ExtensionClassification"/> values, in spec order.</summary>
  public static IReadOnlyList<ExtensionClassification> Classifications { get; } =
    [ExtensionClassification.Modular, ExtensionClassification.Specialized, ExtensionClassification.Experimental];

  /// <summary>The wire-string forms of the classifications, in spec order: <c>modular</c>, <c>specialized</c>, <c>experimental</c>.</summary>
  public static IReadOnlyList<string> ClassificationNames { get; } = ["modular", "specialized", "experimental"];

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a recognized classification wire string (spec R-24.1-a).</summary>
  /// <param name="value">The candidate classification token.</param>
  /// <returns><c>true</c> when recognized.</returns>
  public static bool IsClassification(string? value) =>
    value is "modular" or "specialized" or "experimental";

  // ─── §24.5 — The four surface channels ─────────────────────────────────────────

  /// <summary>
  /// The four — and ONLY four — channels through which an active extension may extend the protocol
  /// surface (spec §24.5, R-24.5-a). Adding surface through any other channel is non-conformant.
  /// </summary>
  public enum SurfaceChannel
  {
    /// <summary>Additional request methods and notifications (R-24.5-b).</summary>
    Method,

    /// <summary>Additional reserved <c>_meta</c> keys under a controlled vendor prefix (R-24.5-d).</summary>
    MetaKey,

    /// <summary>Additional <c>resultType</c> discriminator values (R-24.5-e).</summary>
    ResultType,

    /// <summary>Additional fields on existing objects (R-24.5-g).</summary>
    Field,
  }

  /// <summary>The four sanctioned surface channels, in spec order (R-24.5-a).</summary>
  public static IReadOnlyList<SurfaceChannel> SurfaceChannels { get; } =
    [SurfaceChannel.Method, SurfaceChannel.MetaKey, SurfaceChannel.ResultType, SurfaceChannel.Field];

  /// <summary>The wire-string forms of the four channels, in spec order: <c>method</c>, <c>meta-key</c>, <c>result-type</c>, <c>field</c>.</summary>
  public static IReadOnlyList<string> SurfaceChannelNames { get; } = ["method", "meta-key", "result-type", "field"];

  /// <summary>Returns <c>true</c> when <paramref name="channel"/> is one of the four sanctioned surface-channel wire strings (R-24.5-a).</summary>
  /// <param name="channel">The candidate channel token.</param>
  /// <returns><c>true</c> when sanctioned.</returns>
  public static bool IsSanctionedSurfaceChannel(string? channel) =>
    channel is "method" or "meta-key" or "result-type" or "field";

  // ─── Settings values & the extensions map shape (§6.5) ─────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a non-<c>null</c>, non-array JSON object —
  /// the only legal shape for an extension settings value (spec R-6.5-h). An empty object <c>{}</c>
  /// qualifies (a valid enabling declaration, not absence). A JSON <c>null</c> literal does NOT
  /// qualify (R-6.5-i).
  /// </summary>
  /// <param name="value">The candidate settings node.</param>
  /// <returns><c>true</c> when the node is a JSON object.</returns>
  public static bool IsSettings(JsonNode? value) => value is JsonObject;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="map"/> is a valid producer-built <c>extensions</c> map:
  /// every value is a settings object and no value is the JSON <c>null</c> literal (spec R-6.5-i).
  /// A receiver processing an untrusted map should instead call <see cref="NormalizeMap"/>.
  /// </summary>
  /// <param name="map">The candidate <c>extensions</c> map.</param>
  /// <returns><c>true</c> when every value is a settings object.</returns>
  public static bool IsValidMap(JsonObject? map)
  {
    if (map is null) return false;
    foreach (var (_, value) in map)
    {
      if (!IsSettings(value)) return false;
    }
    return true;
  }

  // ─── Normalization / forward compatibility (§6.5, §6.6) ────────────────────────

  /// <summary>
  /// Normalizes a raw, possibly-untrusted <c>extensions</c> map into the set of extensions a receiver
  /// should consider ADVERTISED by the peer (spec R-6.5-h, R-6.5-j, R-6.6-d). A <c>null</c>-valued or
  /// otherwise-malformed (array/scalar) entry is ignored; a well-formed <c>{}</c> is retained; keys
  /// whose identifiers are unknown to the receiver are RETAINED (forward compatibility is about not
  /// erroring — whether such a key becomes active is decided by <see cref="Intersect"/>). Returns a
  /// NEW object; the input is not mutated.
  /// </summary>
  /// <param name="raw">The peer's advertised <c>extensions</c> map, or <c>null</c> when none.</param>
  /// <returns>A clean map with no <c>null</c>/malformed values.</returns>
  public static JsonObject NormalizeMap(JsonObject? raw)
  {
    var output = new JsonObject();
    if (raw is null) return output;
    foreach (var (key, value) in raw)
    {
      // null / array / scalar values are malformed and ignored (R-6.5-i, R-6.5-j).
      if (value is JsonObject settings)
      {
        output[key] = settings.DeepClone();
      }
    }
    return output;
  }

  /// <summary>
  /// Returns <c>true</c> when a receiver should treat <paramref name="identifier"/> as ADVERTISED by a
  /// peer whose raw <c>extensions</c> map is <paramref name="raw"/> — the key is present and maps to a
  /// valid (non-<c>null</c>, object) settings value (spec R-6.5-h, R-6.5-j). A <c>null</c>-valued or
  /// otherwise-malformed entry is treated as not advertised.
  /// </summary>
  /// <param name="raw">The peer's raw <c>extensions</c> map.</param>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns><c>true</c> when validly advertised.</returns>
  public static bool IsAdvertised(JsonObject? raw, string identifier)
  {
    if (raw is null) return false;
    return raw.TryGetPropertyValue(identifier, out var value) && value is JsonObject;
  }

  /// <summary>
  /// Returns the settings object a peer advertised for <paramref name="identifier"/>, or <c>null</c>
  /// when the extension is not validly advertised (absent, <c>null</c>, or malformed) (spec R-6.5-h,
  /// R-6.5-j). The returned object MAY contain keys the receiving extension does not define; those
  /// MUST be ignored — use <see cref="PickKnownSettings"/> to project to known keys.
  /// </summary>
  /// <param name="raw">The peer's raw <c>extensions</c> map.</param>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns>The advertised settings object, or <c>null</c>.</returns>
  public static JsonObject? GetSettings(JsonObject? raw, string identifier)
  {
    if (raw is null) return null;
    return raw.TryGetPropertyValue(identifier, out var value) && value is JsonObject settings
      ? settings
      : null;
  }

  /// <summary>
  /// Projects a settings object down to only the keys an extension defines, dropping any keys the
  /// extension does not recognize (spec R-6.5-k, R-6.6-e). This realizes "a receiver MUST ignore
  /// settings keys it does not recognize": unknown keys are silently dropped, never treated as an
  /// error, so an extension can add settings over time without breaking older receivers.
  /// </summary>
  /// <param name="settings">The raw settings object (may carry unknown keys).</param>
  /// <param name="knownKeys">The settings keys this extension version defines.</param>
  /// <returns>A NEW object containing only the recognized keys.</returns>
  public static JsonObject PickKnownSettings(JsonObject settings, IEnumerable<string> knownKeys)
  {
    ArgumentNullException.ThrowIfNull(settings);
    ArgumentNullException.ThrowIfNull(knownKeys);
    var known = knownKeys as ISet<string> ?? new HashSet<string>(knownKeys, StringComparer.Ordinal);
    var output = new JsonObject();
    foreach (var (key, value) in settings)
    {
      if (known.Contains(key)) output[key] = value?.DeepClone();
    }
    return output;
  }

  // ─── Activation by intersection (§6.5, R-6.5-l/m; §24.3/§24.4) ──────────────────

  /// <summary>
  /// Returns the set of extension identifiers ACTIVE for an interaction: those advertised (validly) by
  /// BOTH peers — the intersection of the two maps (spec R-6.5-l, R-24.3-d). Each raw map is
  /// normalized first, so <c>null</c>/malformed entries (R-6.5-j) and unknown one-sided identifiers
  /// (R-6.6-d) fall outside the intersection. The result is a sorted (ordinal) array for deterministic
  /// output. An empty or absent map on either side yields an empty active set.
  /// </summary>
  /// <param name="clientExtensions">The client's advertised <c>extensions</c> map (raw).</param>
  /// <param name="serverExtensions">The server's advertised <c>extensions</c> map (raw).</param>
  /// <returns>The sorted intersection of validly-advertised identifiers.</returns>
  public static IReadOnlyList<string> Intersect(JsonObject? clientExtensions, JsonObject? serverExtensions)
  {
    var client = NormalizeMap(clientExtensions);
    var server = NormalizeMap(serverExtensions);
    var active = new List<string>();
    foreach (var (id, _) in client)
    {
      if (server.ContainsKey(id)) active.Add(id);
    }
    active.Sort(StringComparer.Ordinal);
    return active;
  }

  /// <summary>
  /// Returns <c>true</c> when extension <paramref name="identifier"/> is ACTIVE between two peers —
  /// i.e. both peers validly advertise it (spec R-6.5-l). A peer MUST NOT exercise an extension's
  /// behavior unless this returns <c>true</c>.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <param name="clientExtensions">The client's advertised <c>extensions</c> map (raw).</param>
  /// <param name="serverExtensions">The server's advertised <c>extensions</c> map (raw).</param>
  /// <returns><c>true</c> when active on both sides.</returns>
  public static bool IsActive(string identifier, JsonObject? clientExtensions, JsonObject? serverExtensions) =>
    IsAdvertised(clientExtensions, identifier) && IsAdvertised(serverExtensions, identifier);

  /// <summary>
  /// Computes the active set for an interaction: the intersection of the client's and server's
  /// advertised maps (spec R-24.3-d). A thin alias over <see cref="Intersect"/>.
  /// </summary>
  /// <param name="clientExtensions">The client's advertised <c>extensions</c> map (raw).</param>
  /// <param name="serverExtensions">The server's advertised <c>extensions</c> map (raw).</param>
  /// <returns>The sorted active set.</returns>
  public static IReadOnlyList<string> ComputeActiveSet(JsonObject? clientExtensions, JsonObject? serverExtensions) =>
    Intersect(clientExtensions, serverExtensions);

  /// <summary>
  /// Computes the active set for ONE request under the stateless model: it reads the client's
  /// capabilities from the request being processed and intersects them with the server's advertised
  /// capabilities (spec R-24.4-a, R-24.4-b, R-24.4-c). The result depends solely on
  /// <paramref name="requestClientExtensions"/> and <paramref name="serverExtensions"/>; nothing from a
  /// prior request is consulted — a request that does not advertise an extension yields an active set
  /// without it.
  /// </summary>
  /// <param name="requestClientExtensions">This request's advertised client <c>extensions</c> map (raw; <c>null</c> ⇒ none).</param>
  /// <param name="serverExtensions">The server's advertised <c>extensions</c> map (raw).</param>
  /// <returns>The per-request active set.</returns>
  public static IReadOnlyList<string> ActiveSetForRequest(JsonObject? requestClientExtensions, JsonObject? serverExtensions) =>
    Intersect(requestClientExtensions, serverExtensions);

  /// <summary>
  /// Returns <c>true</c> when an extension MAY emit its surface in the current interaction: it is
  /// present in <paramref name="activeSet"/> (spec R-24.1-c, R-24.3-e, R-24.5-c). Extensions are
  /// disabled by default — a peer MUST NOT emit a method, notification, reserved <c>_meta</c> key,
  /// <c>resultType</c> value, or field defined by an extension this predicate reports as not active.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <param name="activeSet">The identifiers active for this interaction.</param>
  /// <returns><c>true</c> when the extension may emit surface.</returns>
  public static bool MayEmitSurface(string identifier, IEnumerable<string> activeSet)
  {
    ArgumentNullException.ThrowIfNull(activeSet);
    var active = activeSet as ISet<string> ?? new HashSet<string>(activeSet, StringComparer.Ordinal);
    return active.Contains(identifier);
  }

  // ─── One-sided-support fallback (§6.5, R-6.5-n; §24.7) ──────────────────────────

  /// <summary>
  /// What a peer should do for an operation that COULD use an extension which is not active in the
  /// intersection (spec R-6.5-n, R-24.7).
  /// </summary>
  public enum FallbackDecision
  {
    /// <summary>The extension is active; exercise its behavior.</summary>
    UseExtension,

    /// <summary>Not active, but the operation has a core fallback.</summary>
    Fallback,

    /// <summary>Not active and the extension is MANDATORY for this operation; reject with an appropriate error.</summary>
    Reject,
  }

  /// <summary>
  /// Decides how to handle an operation given whether the extension is active and whether it is
  /// mandatory (spec R-6.5-l, R-6.5-n). A peer MUST NOT reject merely because the extension is
  /// one-sided; rejection happens only when the extension is mandatory.
  /// </summary>
  /// <param name="active">Whether the extension is advertised by both peers.</param>
  /// <param name="mandatory">Whether the extension is mandatory for the operation.</param>
  /// <returns>The fallback decision.</returns>
  public static FallbackDecision DecideFallback(bool active, bool mandatory)
  {
    if (active) return FallbackDecision.UseExtension;
    return mandatory ? FallbackDecision.Reject : FallbackDecision.Fallback;
  }

  /// <summary>
  /// Decides how a peer should handle an operation that could use <paramref name="identifier"/>, given
  /// the active set and whether the operation mandates the extension (spec R-24.7-a, R-24.7-b,
  /// R-24.7-d, R-24.7-f). Derives <c>active</c> from membership in <paramref name="activeSet"/>.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <param name="activeSet">The active set for this interaction.</param>
  /// <param name="mandatory">Whether the extension is mandatory for the operation.</param>
  /// <returns>The fallback decision.</returns>
  public static FallbackDecision DecideUse(string identifier, IEnumerable<string> activeSet, bool mandatory) =>
    DecideFallback(MayEmitSurface(identifier, activeSet), mandatory);

  // ─── Forward compatibility for capability objects (§6.6) ───────────────────────

  /// <summary>
  /// The core (recognized) client capability field names a receiver of this SDK revision understands
  /// (spec R-6.6-a – R-6.6-c, R-6.6-f). Any field not in this set is unknown and MUST be tolerated and
  /// ignored. Mirrors the fields on <c>ClientCapabilities</c>.
  /// </summary>
  public static IReadOnlySet<string> KnownClientCapabilityFields { get; } =
    new HashSet<string>(StringComparer.Ordinal) { "experimental", "elicitation", "roots", "sampling", "extensions" };

  /// <summary>The core (recognized) server capability field names (spec R-6.6-a – R-6.6-c, R-6.6-f).</summary>
  public static IReadOnlySet<string> KnownServerCapabilityFields { get; } =
    new HashSet<string>(StringComparer.Ordinal)
    { "experimental", "completions", "prompts", "resources", "tools", "logging", "extensions" };

  /// <summary>
  /// Returns the capability fields in <paramref name="caps"/> that <paramref name="known"/> does not
  /// recognize, in document order (spec R-6.6-b, R-6.6-c, R-6.6-f). A receiver MUST ignore exactly
  /// these fields and MUST NOT reject the capability object because they are present.
  /// </summary>
  /// <param name="caps">A raw client/server capabilities object.</param>
  /// <param name="known">The recognized field names.</param>
  /// <returns>The unknown field names.</returns>
  public static IReadOnlyList<string> UnknownCapabilityFields(JsonObject caps, IReadOnlySet<string> known)
  {
    ArgumentNullException.ThrowIfNull(caps);
    ArgumentNullException.ThrowIfNull(known);
    var unknown = new List<string>();
    foreach (var (field, _) in caps)
    {
      if (!known.Contains(field)) unknown.Add(field);
    }
    return unknown;
  }

  /// <summary>
  /// Produces the view of a capability object a receiver acts on: the recognized fields only, with
  /// unrecognized fields dropped (spec R-6.6-b, R-6.6-c, R-6.6-f, R-6.6-g). The presence of an unknown
  /// field never causes rejection — this function simply omits it; the recognized fields pass through
  /// unchanged so no inference can be drawn from a dropped field.
  /// </summary>
  /// <param name="caps">A raw capability object (possibly carrying unknown fields).</param>
  /// <param name="known">The recognized field names for this object kind.</param>
  /// <returns>A NEW object with only recognized fields.</returns>
  public static JsonObject IgnoreUnknownCapabilityFields(JsonObject caps, IReadOnlySet<string> known)
  {
    ArgumentNullException.ThrowIfNull(caps);
    ArgumentNullException.ThrowIfNull(known);
    var output = new JsonObject();
    foreach (var (field, value) in caps)
    {
      if (known.Contains(field)) output[field] = value?.DeepClone();
    }
    return output;
  }

  // ─── §24.5(1) — Method / notification namespacing ──────────────────────────────

  /// <summary>
  /// Derives the method namespace prefix an extension owns from its identifier's NAME segment (spec
  /// R-24.5-b). The Tasks extension <c>io.modelcontextprotocol/tasks</c> defines methods such as
  /// <c>tasks/get</c> — the namespace is the identifier's extension-name followed by <c>/</c>. Returns
  /// <c>null</c> when the identifier is malformed or its name is empty.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns>The namespace (e.g. <c>tasks/</c>), or <c>null</c>.</returns>
  public static string? DeriveNamespace(string identifier)
  {
    var parsed = ParseId(identifier);
    if (parsed is null) return null;
    if (!IsValidPrefix(parsed.Value.Prefix) || !IsValidName(parsed.Value.Name)) return null;
    if (parsed.Value.Name.Length == 0) return null;
    return parsed.Value.Name + "/";
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="method"/> belongs to the namespace derived from
  /// <paramref name="identifier"/> — it begins with <c>&lt;extension-name&gt;/</c> and carries a
  /// non-empty member segment after the slash (spec R-24.5-b). <c>tasks/</c> alone is not a method.
  /// </summary>
  /// <param name="method">The method string.</param>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns><c>true</c> when the method is in the extension namespace.</returns>
  public static bool IsMethodInNamespace(string method, string identifier)
  {
    ArgumentNullException.ThrowIfNull(method);
    var ns = DeriveNamespace(identifier);
    if (ns is null) return false;
    return method.Length > ns.Length && method.StartsWith(ns, StringComparison.Ordinal);
  }

  /// <summary>
  /// Builds a namespaced method string for an extension from its identifier and a member name (spec
  /// R-24.5-b), e.g. <c>("io.modelcontextprotocol/tasks", "get") → "tasks/get"</c>.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <param name="member">The member name (must be non-empty).</param>
  /// <returns>The namespaced method string.</returns>
  /// <exception cref="ArgumentException">When the identifier yields no namespace or the member is empty.</exception>
  public static string ExtensionMethod(string identifier, string member)
  {
    ArgumentNullException.ThrowIfNull(member);
    var ns = DeriveNamespace(identifier);
    if (ns is null)
    {
      throw new ArgumentException($"Cannot derive a method namespace from \"{identifier}\" (R-24.5-b)", nameof(identifier));
    }
    if (member.Length == 0)
    {
      throw new ArgumentException("Extension method member name MUST be non-empty (R-24.5-b)", nameof(member));
    }
    return ns + member;
  }

  // ─── §24.5(2) — Extension-controlled reserved `_meta` keys ─────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="metaKey"/> is a reserved <c>_meta</c> key that the
  /// extension identified by <paramref name="identifier"/> is entitled to define — i.e. the key's
  /// prefix labels are the same dot-separated labels as the extension identifier's vendor prefix (spec
  /// R-24.5-d). For <c>io.modelcontextprotocol/ui</c> the controlled keys are those under
  /// <c>io.modelcontextprotocol/…</c>; for <c>com.example/x</c>, under <c>com.example/…</c>. A bare
  /// <c>_meta</c> key controls no namespace.
  /// </summary>
  /// <param name="metaKey">The candidate reserved <c>_meta</c> key.</param>
  /// <param name="identifier">The extension identifier.</param>
  /// <returns><c>true</c> when the extension controls the key.</returns>
  public static bool IsExtensionControlledMetaKey(string metaKey, string identifier)
  {
    ArgumentNullException.ThrowIfNull(metaKey);
    var parsedId = ParseId(identifier);
    if (parsedId is null || !IsValidPrefix(parsedId.Value.Prefix)) return false;

    // Parse the _meta key on its FIRST slash (prefix body before it, name after). A bare key — no
    // slash — controls no namespace. The _meta prefix grammar is identical to the extension prefix
    // grammar (§4 / §6.5): one or more dot-separated valid labels; the name follows the extension
    // name grammar. We validate the key's parts directly rather than via the registered-key table so
    // any vendor-controlled key (e.g. com.example/trace, io.modelcontextprotocol/ui-data) is honored.
    var slash = metaKey.IndexOf('/');
    if (slash < 0) return false; // a bare `_meta` key controls no namespace
    var metaPrefixBody = metaKey[..slash];
    var metaName = metaKey[(slash + 1)..];

    if (!IsValidPrefix(metaPrefixBody)) return false;
    if (metaName.Length == 0 || !NameRegex().IsMatch(metaName)) return false;

    // Compare the prefix label bodies octet-for-octet (R-24.2-g / §4).
    return string.Equals(metaPrefixBody, parsedId.Value.Prefix, StringComparison.Ordinal);
  }

  /// <summary>
  /// Builds a reserved <c>_meta</c> key under the extension's controlled vendor prefix (spec R-24.5-d),
  /// e.g. <c>("com.example/x", "trace") → "com.example/trace"</c>.
  /// </summary>
  /// <param name="identifier">The extension identifier.</param>
  /// <param name="name">The key name (a valid <c>_meta</c> key name).</param>
  /// <returns>The reserved <c>_meta</c> key.</returns>
  /// <exception cref="ArgumentException">When the identifier is malformed or the name is invalid.</exception>
  public static string ExtensionMetaKey(string identifier, string name)
  {
    ArgumentNullException.ThrowIfNull(name);
    var parsedId = ParseId(identifier);
    if (parsedId is null || !IsValidPrefix(parsedId.Value.Prefix))
    {
      throw new ArgumentException($"Cannot derive a _meta prefix from \"{identifier}\" (R-24.5-d)", nameof(identifier));
    }
    // A valid _meta key name begins and ends with alphanumeric; reuse the extension name grammar,
    // which is identical to the _meta-key name grammar (§4 / §6.5).
    if (name.Length == 0 || !NameRegex().IsMatch(name))
    {
      throw new ArgumentException($"\"{name}\" is not a valid _meta key name (R-24.5-d)", nameof(name));
    }
    return $"{parsedId.Value.Prefix}/{name}";
  }

  // ─── §24.5(3) — The open `resultType` set ──────────────────────────────────────

  /// <summary>
  /// The core-protocol <c>resultType</c> discriminator values (spec §3.6). The accepted set for any
  /// interaction is these PLUS the values contributed by active extensions (R-24.5-e).
  /// </summary>
  public static IReadOnlyList<string> CoreResultTypeValues { get; } =
    [ResultTypes.Complete, ResultTypes.InputRequired];

  /// <summary>
  /// Returns the set of <c>resultType</c> values a receiver will accept for an interaction: the core
  /// values together with every value contributed by an extension in
  /// <paramref name="activeContributions"/> that is also in <paramref name="activeSet"/> (spec
  /// R-24.5-e). Contributions from a NON-active extension are excluded (R-24.5-f).
  /// </summary>
  /// <param name="activeSet">Identifiers active for this interaction.</param>
  /// <param name="activeContributions">Map of extension identifier → the <c>resultType</c> values it contributes.</param>
  /// <returns>The accepted <c>resultType</c> set.</returns>
  public static ISet<string> AcceptedResultTypes(
    IEnumerable<string> activeSet,
    IReadOnlyDictionary<string, IEnumerable<string>>? activeContributions = null)
  {
    ArgumentNullException.ThrowIfNull(activeSet);
    var active = activeSet as ISet<string> ?? new HashSet<string>(activeSet, StringComparer.Ordinal);
    var accepted = new HashSet<string>(CoreResultTypeValues, StringComparer.Ordinal);
    if (activeContributions is not null)
    {
      foreach (var (identifier, values) in activeContributions)
      {
        if (!active.Contains(identifier)) continue; // non-active contributions excluded (R-24.5-f)
        foreach (var value in values) accepted.Add(value);
      }
    }
    return accepted;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="resultType"/> is accepted: a core value, or a value
  /// contributed by an extension in the active set (spec R-24.5-e, R-24.5-f). A value that is neither
  /// is INVALID — the receiver MUST treat the response as an error.
  /// </summary>
  /// <param name="resultType">The discriminator value.</param>
  /// <param name="activeSet">Identifiers active for this interaction.</param>
  /// <param name="activeContributions">Map of extension identifier → the <c>resultType</c> values it contributes.</param>
  /// <returns><c>true</c> when accepted.</returns>
  public static bool IsResultTypeAccepted(
    string resultType,
    IEnumerable<string> activeSet,
    IReadOnlyDictionary<string, IEnumerable<string>>? activeContributions = null)
  {
    if (string.Equals(resultType, ResultTypes.Complete, StringComparison.Ordinal) ||
        string.Equals(resultType, ResultTypes.InputRequired, StringComparison.Ordinal))
    {
      return true;
    }
    return AcceptedResultTypes(activeSet, activeContributions).Contains(resultType);
  }

  // ─── §24.6 — Versioning, stability, deprecation ────────────────────────────────

  /// <summary>
  /// Reads an extension's version from the settings object it advertised, making the version
  /// discoverable purely through negotiation (spec R-24.6-a, R-24.6-b). The version is taken from the
  /// settings' <paramref name="versionKey"/> field when it is a string or a finite number (numbers are
  /// normalized to their string form). It is NEVER inferred out-of-band — when the extension is not
  /// advertised or carries no version, this returns <c>null</c>.
  /// </summary>
  /// <param name="extensionsMap">A peer's advertised <c>extensions</c> map (raw).</param>
  /// <param name="identifier">The extension whose version to read.</param>
  /// <param name="versionKey">The settings key carrying the version (default <c>version</c>).</param>
  /// <returns>The version string, or <c>null</c>.</returns>
  public static string? GetVersion(JsonObject? extensionsMap, string identifier, string versionKey = "version")
  {
    var settings = GetSettings(extensionsMap, identifier);
    if (settings is null) return null;
    if (!settings.TryGetPropertyValue(versionKey, out var raw) || raw is not JsonValue value) return null;
    if (value.TryGetValue<string>(out var s)) return s;
    if (value.TryGetValue<double>(out var d) && double.IsFinite(d))
    {
      // Render integers without a trailing ".0" to mirror JS String(number).
      return d == Math.Floor(d) && !double.IsInfinity(d)
        ? ((long)d).ToString(System.Globalization.CultureInfo.InvariantCulture)
        : d.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
    return null;
  }

  /// <summary>
  /// The kinds of change an extension may make to its surface (spec §24.6). The incompatible ones
  /// SHOULD be published under a new identifier rather than evolved within one (R-24.6-d).
  /// </summary>
  public enum ChangeKind
  {
    /// <summary>Adding a new OPTIONAL field — backward compatible (R-24.6-c).</summary>
    AddOptionalField,

    /// <summary>Adding a capability flag — backward compatible (R-24.6-c).</summary>
    AddCapabilityFlag,

    /// <summary>Removing a field — incompatible (R-24.6-d).</summary>
    RemoveField,

    /// <summary>Renaming a field — incompatible (R-24.6-d).</summary>
    RenameField,

    /// <summary>Changing a field's type — incompatible (R-24.6-d).</summary>
    ChangeType,

    /// <summary>Altering existing behavior's meaning — incompatible (R-24.6-d).</summary>
    ChangeSemantics,

    /// <summary>Adding a new REQUIRED field — incompatible (R-24.6-d).</summary>
    AddRequiredField,
  }

  /// <summary>
  /// Returns <c>true</c> when a change of <paramref name="kind"/> is INCOMPATIBLE — it would cause an
  /// existing implementation to fail or behave incorrectly — and therefore SHOULD be published under a
  /// new extension identifier (spec R-24.6-d). Backward-compatible changes return <c>false</c>.
  /// </summary>
  /// <param name="kind">The change kind.</param>
  /// <returns><c>true</c> when incompatible.</returns>
  public static bool IsIncompatibleChange(ChangeKind kind) => kind switch
  {
    ChangeKind.AddOptionalField => false,
    ChangeKind.AddCapabilityFlag => false,
    _ => true,
  };

  /// <summary>
  /// Suggests a successor extension identifier for an incompatible change, keeping the two distinct in
  /// the negotiation map (spec R-24.6-d), e.g.
  /// <c>com.example/my-extension → com.example/my-extension-2</c>. The suffix is appended to the name
  /// segment so the result is itself a well-formed identifier under the same vendor prefix.
  /// </summary>
  /// <param name="identifier">The current extension identifier.</param>
  /// <param name="suffix">The successor suffix (default <c>2</c>).</param>
  /// <returns>The successor identifier.</returns>
  /// <exception cref="ArgumentException">When the identifier is malformed.</exception>
  public static string SuggestSuccessorId(string identifier, string suffix = "2")
  {
    var parsed = ParseId(identifier);
    if (parsed is null || !IsValidId(identifier))
    {
      throw new ArgumentException(
        $"Cannot derive a successor for malformed identifier \"{identifier}\" (R-24.6-d)", nameof(identifier));
    }
    return $"{parsed.Value.Prefix}/{parsed.Value.Name}-{suffix}";
  }

  // ─── §24.7 — Graceful degradation & required-extension errors ──────────────────

  /// <summary>
  /// The JSON-RPC error code an implementation that MANDATES an extension uses when the other side does
  /// not advertise it and it refuses the interaction (spec R-24.7-f). The framework mints no code of
  /// its own; a mandated-but-absent extension is a "missing required capability" condition, so this
  /// reuses the core <c>-32003</c> code.
  /// </summary>
  public const int RequiredExtensionAbsentCode = Stackific.Mcp.JsonRpc.ErrorCodes.MissingRequiredClientCapability;

  /// <summary>An actionable error for a mandated extension the other peer did not advertise (spec §24.7).</summary>
  /// <param name="Code">The error code (always <see cref="RequiredExtensionAbsentCode"/>).</param>
  /// <param name="Message">A human-readable message naming the required extension.</param>
  /// <param name="RequiredExtension">The required-but-absent extension identifier.</param>
  public readonly record struct RequiredExtensionError(int Code, string Message, string RequiredExtension);

  /// <summary>
  /// Builds an actionable error for the case where an implementation genuinely requires an extension
  /// the other side does not advertise (spec R-24.7-d, R-24.7-e). The error identifies the required
  /// extension in both the message and the payload so the failure is not opaque.
  /// </summary>
  /// <param name="identifier">The required-but-absent extension identifier.</param>
  /// <returns>The actionable error.</returns>
  public static RequiredExtensionError BuildRequiredExtensionError(string identifier) =>
    new(RequiredExtensionAbsentCode, $"Required extension not active: \"{identifier}\"", identifier);

  // ─── Extension definition & no-redefinition guard ──────────────────────────────

  /// <summary>
  /// A declarative description of the surface a single extension contributes — the machine-checkable
  /// form of "an active extension MAY extend the surface ONLY in the four enumerated ways" (spec §24.5).
  /// A conformance suite validates a claimed surface with <see cref="ValidateDefinition"/>.
  /// </summary>
  public sealed record ExtensionDefinition
  {
    /// <summary>The extension's globally unique identifier (§24.2).</summary>
    public required string Identifier { get; init; }

    /// <summary>How the extension is characterized (§24.1); optional.</summary>
    public string? Classification { get; init; }

    /// <summary>Channel 1 — request methods and notifications the extension defines (R-24.5-b).</summary>
    public IReadOnlyList<string>? Methods { get; init; }

    /// <summary>Channel 2 — reserved <c>_meta</c> keys the extension defines (R-24.5-d).</summary>
    public IReadOnlyList<string>? MetaKeys { get; init; }

    /// <summary>Channel 3 — additional <c>resultType</c> discriminator values (R-24.5-e). Named <c>ResultTypeValues</c> to avoid clashing with the <see cref="ResultTypes"/> static class.</summary>
    public IReadOnlyList<string>? ResultTypeValues { get; init; }

    /// <summary>Channel 4 — additional fields the extension adds to existing objects (R-24.5-g), as <c>"&lt;ObjectName&gt;.&lt;fieldName&gt;"</c>.</summary>
    public IReadOnlyList<string>? Fields { get; init; }
  }

  /// <summary>A single reason an <see cref="ExtensionDefinition"/> fails framework conformance.</summary>
  /// <param name="Channel">Which surface channel (or <c>identifier</c>) the violation concerns.</param>
  /// <param name="Value">The offending value (a method, key, resultType, field, or the identifier).</param>
  /// <param name="Message">A human-readable description.</param>
  public readonly record struct ExtensionDefinitionViolation(string Channel, string Value, string Message);

  /// <summary>Outcome of <see cref="ValidateDefinition"/>.</summary>
  /// <param name="Ok"><c>true</c> when the definition conforms to the framework.</param>
  /// <param name="Violations">The accumulated violations (empty when <paramref name="Ok"/> is <c>true</c>).</param>
  public readonly record struct ExtensionDefinitionValidation(bool Ok, IReadOnlyList<ExtensionDefinitionViolation> Violations);

  /// <summary>
  /// Validates that an <see cref="ExtensionDefinition"/> conforms to the §24 framework: a valid
  /// identifier, namespaced methods, controlled <c>_meta</c> keys, and no redefinition of core surface
  /// (spec R-24-a, R-24.5-b, R-24.5-d, R-24.5-e, R-24.5-i). Accumulates ALL violations (except when the
  /// identifier itself is invalid — then namespaces cannot be derived, so it reports and stops).
  /// </summary>
  /// <param name="def">The extension definition to validate.</param>
  /// <returns>The validation outcome.</returns>
  public static ExtensionDefinitionValidation ValidateDefinition(ExtensionDefinition def)
  {
    ArgumentNullException.ThrowIfNull(def);
    var violations = new List<ExtensionDefinitionViolation>();

    if (!IsValidId(def.Identifier))
    {
      violations.Add(new ExtensionDefinitionViolation(
        "identifier", def.Identifier, "Extension identifier is not well-formed (R-24.2-a..d)"));
      return new ExtensionDefinitionValidation(false, violations);
    }

    if (def.Classification is not null && !IsClassification(def.Classification))
    {
      violations.Add(new ExtensionDefinitionViolation(
        "identifier", def.Classification, "Unknown extension classification (R-24.1-a)"));
    }

    foreach (var method in def.Methods ?? [])
    {
      if (!IsMethodInNamespace(method, def.Identifier))
      {
        violations.Add(new ExtensionDefinitionViolation(
          "method", method, $"Method \"{method}\" is not namespaced under the extension (R-24.5-b)"));
      }
    }

    foreach (var key in def.MetaKeys ?? [])
    {
      if (!IsExtensionControlledMetaKey(key, def.Identifier))
      {
        violations.Add(new ExtensionDefinitionViolation(
          "meta-key", key, $"_meta key \"{key}\" is not under a prefix the extension controls (R-24.5-d)"));
      }
    }

    foreach (var rt in def.ResultTypeValues ?? [])
    {
      if (string.Equals(rt, ResultTypes.Complete, StringComparison.Ordinal) ||
          string.Equals(rt, ResultTypes.InputRequired, StringComparison.Ordinal))
      {
        violations.Add(new ExtensionDefinitionViolation(
          "result-type", rt,
          $"resultType \"{rt}\" redefines a core value; extensions may only add new values (R-24.5-e, R-24.5-i)"));
      }
    }

    return new ExtensionDefinitionValidation(violations.Count == 0, violations);
  }

  // ─── Settings reconciliation (§24.3-g) ─────────────────────────────────────────

  /// <summary>The reconciled settings of both peers for one active extension (spec R-24.3-g).</summary>
  /// <param name="Client">The client's advertised settings for the extension.</param>
  /// <param name="Server">The server's advertised settings for the extension.</param>
  public readonly record struct ReconciledSettings(JsonObject Client, JsonObject Server);

  /// <summary>
  /// Reconciles the settings a peer advertised for <paramref name="identifier"/> on each side (spec
  /// R-24.3-g). Returns <c>null</c> when the extension is not advertised by BOTH peers (it is not
  /// active, so there is nothing to reconcile). Each side's settings are returned as-is; the extension
  /// itself decides how to combine them.
  /// </summary>
  /// <param name="clientExtensions">The client's advertised <c>extensions</c> map (raw).</param>
  /// <param name="serverExtensions">The server's advertised <c>extensions</c> map (raw).</param>
  /// <param name="identifier">The extension whose settings to reconcile.</param>
  /// <returns>The reconciled settings, or <c>null</c> when not active on both sides.</returns>
  public static ReconciledSettings? ReconcileSettings(
    JsonObject? clientExtensions,
    JsonObject? serverExtensions,
    string identifier)
  {
    if (!IsAdvertised(clientExtensions, identifier)) return null;
    if (!IsAdvertised(serverExtensions, identifier)) return null;
    var client = GetSettings(clientExtensions, identifier);
    var server = GetSettings(serverExtensions, identifier);
    if (client is null || server is null) return null;
    return new ReconciledSettings(client, server);
  }
}

/// <summary>
/// Routes extension-defined methods to their handlers, enforcing the two framework rules that govern
/// dispatch (spec §24.5): method strings are namespaced under the registering extension (R-24.5-b), and
/// a handler is invoked ONLY when its extension is in the active set for the interaction (R-24.5-c).
/// </summary>
/// <remarks>
/// Registration validates the namespace eagerly so a misnamed method is rejected at wiring time, not
/// silently at dispatch. The router holds no per-connection state; the active set is supplied per
/// dispatch, honoring the stateless model (§24.4).
/// </remarks>
public sealed class ExtensionMethodRouter
{
  private readonly Dictionary<string, RegisteredMethod> _methods = new(StringComparer.Ordinal);

  private readonly record struct RegisteredMethod(string Identifier, Func<object?, object?> Handler);

  /// <summary>Why <see cref="Dispatch"/> declined to invoke a handler.</summary>
  public enum DispatchRejection
  {
    /// <summary>No extension registered this method string.</summary>
    UnknownMethod,

    /// <summary>The owning extension is not in the active set for this interaction (R-24.5-c).</summary>
    ExtensionInactive,
  }

  /// <summary>Outcome of <see cref="Dispatch"/>.</summary>
  /// <param name="Ok"><c>true</c> when the handler ran.</param>
  /// <param name="Result">The handler's result when <paramref name="Ok"/> is <c>true</c>.</param>
  /// <param name="Reason">The rejection reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="Code">The core error code carried on a rejection (<c>-32602</c>), so a caller may convert to an error response.</param>
  public readonly record struct DispatchOutcome(bool Ok, object? Result, DispatchRejection? Reason, int? Code);

  /// <summary>
  /// Registers <paramref name="handler"/> for an extension-defined <paramref name="method"/>. The
  /// method MUST be in <paramref name="identifier"/>'s derived namespace (R-24.5-b) and MUST NOT
  /// already be registered (no redefinition, R-24.5-i).
  /// </summary>
  /// <param name="identifier">The owning extension identifier.</param>
  /// <param name="method">The namespaced method string.</param>
  /// <param name="handler">The handler invoked on dispatch.</param>
  /// <returns>This router, for fluent chaining.</returns>
  /// <exception cref="ArgumentException">When the method is not namespaced under the identifier or is already registered.</exception>
  public ExtensionMethodRouter Register(string identifier, string method, Func<object?, object?> handler)
  {
    ArgumentNullException.ThrowIfNull(method);
    ArgumentNullException.ThrowIfNull(handler);
    if (!Extensions.IsMethodInNamespace(method, identifier))
    {
      throw new ArgumentException($"Method \"{method}\" is not namespaced under \"{identifier}\" (R-24.5-b)", nameof(method));
    }
    if (_methods.ContainsKey(method))
    {
      throw new ArgumentException($"Method \"{method}\" is already registered (R-24.5-i)", nameof(method));
    }
    _methods[method] = new RegisteredMethod(identifier, handler);
    return this;
  }

  /// <summary>Returns <c>true</c> when <paramref name="method"/> has a registered handler.</summary>
  /// <param name="method">The method string.</param>
  /// <returns><c>true</c> when registered.</returns>
  public bool Has(string method) => _methods.ContainsKey(method);

  /// <summary>Returns the extension identifier that owns <paramref name="method"/>, or <c>null</c>.</summary>
  /// <param name="method">The method string.</param>
  /// <returns>The owning identifier, or <c>null</c>.</returns>
  public string? OwnerOf(string method) => _methods.TryGetValue(method, out var m) ? m.Identifier : null;

  /// <summary>
  /// Dispatches <paramref name="method"/> with <paramref name="parameters"/>, but only when the owning
  /// extension is in <paramref name="activeSet"/> (spec R-24.5-c). An unknown method or an inactive
  /// owning extension is refused with <c>-32602</c> so a caller can convert the outcome into a core
  /// error response when it chooses to reject rather than ignore (R-24.3-f).
  /// </summary>
  /// <param name="method">The method to dispatch.</param>
  /// <param name="parameters">The method parameters.</param>
  /// <param name="activeSet">The active set for this interaction.</param>
  /// <returns>The dispatch outcome.</returns>
  public DispatchOutcome Dispatch(string method, object? parameters, IEnumerable<string> activeSet)
  {
    if (!_methods.TryGetValue(method, out var registered))
    {
      return new DispatchOutcome(false, null, DispatchRejection.UnknownMethod, Stackific.Mcp.JsonRpc.ErrorCodes.InvalidParams);
    }
    if (!Extensions.MayEmitSurface(registered.Identifier, activeSet))
    {
      return new DispatchOutcome(false, null, DispatchRejection.ExtensionInactive, Stackific.Mcp.JsonRpc.ErrorCodes.InvalidParams);
    }
    return new DispatchOutcome(true, registered.Handler(parameters), null, null);
  }
}
