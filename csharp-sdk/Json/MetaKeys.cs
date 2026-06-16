using System.Text.RegularExpressions;

namespace Stackific.Mcp.Json;

/// <summary>
/// The reserved <c>_meta</c> keys defined by the protocol, plus the structural
/// naming rules for any <c>_meta</c> key (spec §2.6.2 / §4.2, Appendix C).
/// </summary>
/// <remarks>
/// <para>
/// A valid <c>_meta</c> key is an OPTIONAL prefix followed by a name. The prefix, when
/// present, is one or more dot-separated labels terminated by a single slash; each label
/// starts with a letter and ends with a letter or digit, with letters, digits, or hyphens in
/// between, and SHOULD use reverse-DNS notation (for example <c>com.example/</c>). A prefix
/// whose <em>second</em> label is <c>modelcontextprotocol</c> or <c>mcp</c> is reserved for
/// the protocol. The name (after the prefix, or the whole key when there is no prefix) is
/// either empty or begins and ends with an alphanumeric, with alphanumerics, hyphens,
/// underscores, or dots in between.
/// </para>
/// <para>
/// The SDK never rejects an inbound message merely for carrying an unknown <c>_meta</c>
/// key — §4.1 requires unknown keys to be ignored — so the validation helpers here exist for
/// constructing well-formed metadata and for diagnostics, not for gating receipt.
/// </para>
/// </remarks>
public static partial class MetaKeys
{
  /// <summary>The canonical reverse-DNS prefix for keys defined by the MCP spec.</summary>
  public const string CanonicalPrefix = "io.modelcontextprotocol/";

  /// <summary>Reserved key carrying the protocol revision on every client request (§4.3).</summary>
  public const string ProtocolVersion = "io.modelcontextprotocol/protocolVersion";

  /// <summary>Reserved key carrying the client <c>Implementation</c> on every client request (§4.3).</summary>
  public const string ClientInfo = "io.modelcontextprotocol/clientInfo";

  /// <summary>Reserved key carrying the per-request <c>ClientCapabilities</c> (§4.3).</summary>
  public const string ClientCapabilities = "io.modelcontextprotocol/clientCapabilities";

  /// <summary>Reserved key carrying the optional, deprecated per-request log level (§4.3, §15.3).</summary>
  [Obsolete("The io.modelcontextprotocol/logLevel _meta opt-in is Deprecated (spec §4.3, §15.3). Still accepted for backward compatibility.")]
  public const string LogLevel = "io.modelcontextprotocol/logLevel";

  /// <summary>Reserved key correlating a notification with its subscription stream (§10).</summary>
  public const string SubscriptionId = "io.modelcontextprotocol/subscriptionId";

  /// <summary>Reserved bare key: out-of-band progress-correlation token (§15.1).</summary>
  public const string ProgressToken = "progressToken";

  /// <summary>Reserved bare key: W3C Trace Context <c>traceparent</c> (§4.2, §15.4).</summary>
  public const string TraceParent = "traceparent";

  /// <summary>Reserved bare key: W3C Trace Context <c>tracestate</c> (§4.2, §15.4).</summary>
  public const string TraceState = "tracestate";

  /// <summary>Reserved bare key: W3C Baggage (§4.2, §15.4).</summary>
  public const string Baggage = "baggage";

  /// <summary>Extension identifier for the Tasks extension (§25).</summary>
  public const string TasksExtension = "io.modelcontextprotocol/tasks";

  /// <summary>Extension identifier for the Interactive User-Interface extension (§26).</summary>
  public const string UiExtension = "io.modelcontextprotocol/ui";

  /// <summary>Labels that make a prefix reserved when they appear as the second label.</summary>
  private static readonly HashSet<string> ReservedSecondLabels =
    new(StringComparer.Ordinal) { "modelcontextprotocol", "mcp" };

  /// <summary>
  /// The bare keys reserved for W3C trace-context propagation: <c>traceparent</c>,
  /// <c>tracestate</c>, and <c>baggage</c> (§2.6.2 / §4.2, R-2.6.2-i). These are always valid
  /// despite carrying no prefix — they are permitted by exception to the prefix rule.
  /// </summary>
  /// <remarks>
  /// This mirrors the TypeScript <c>TRACE_CONTEXT_KEYS</c> set exactly. It does NOT include
  /// <c>progressToken</c>, which is reserved for a different purpose.
  /// </remarks>
  public static readonly IReadOnlySet<string> TraceContextKeys =
    new HashSet<string>(StringComparer.Ordinal) { TraceParent, TraceState, Baggage };

  /// <summary>
  /// Returns <c>true</c> if <paramref name="prefix"/> is a syntactically valid <c>_meta</c>
  /// key prefix: one or more dot-separated labels terminated by a single <c>/</c>.
  /// (R-2.6.2-b, R-2.6.2-c, R-2.6.2-d, AC-02.17)
  /// </summary>
  /// <param name="prefix">The candidate prefix, including its trailing slash.</param>
  /// <returns><c>true</c> when the prefix is well-formed.</returns>
  public static bool IsValidMetaKeyPrefix(string prefix)
  {
    ArgumentNullException.ThrowIfNull(prefix);
    return PrefixRegex().IsMatch(prefix);
  }

  /// <summary>
  /// Returns <c>true</c> if <paramref name="prefix"/> is reserved — its second label is
  /// <c>modelcontextprotocol</c> or <c>mcp</c> (§2.6.2 / §4.2, R-2.6.2-f). Implementations
  /// MUST NOT define <c>_meta</c> keys under a reserved prefix except as specified by the
  /// protocol or an MCP-published extension.
  /// </summary>
  /// <param name="prefix">
  /// A prefix (with or without a trailing slash) or a full key; the portion up to the first
  /// slash is examined.
  /// </param>
  /// <returns><c>true</c> when the second label is protocol-reserved.</returns>
  /// <remarks>
  /// This accepts both a bare prefix string (for example <c>"io.modelcontextprotocol/"</c>)
  /// and a full key (for example <c>"io.modelcontextprotocol/protocolVersion"</c>): the body
  /// considered for label-splitting is everything before the first slash, mirroring the
  /// TypeScript <c>isReservedMetaKeyPrefix</c> while remaining a drop-in for full keys.
  /// </remarks>
  public static bool IsReservedMetaKeyPrefix(string prefix)
  {
    ArgumentNullException.ThrowIfNull(prefix);
    var slash = prefix.IndexOf('/');
    // Everything before the first slash is the prefix body; if there is no slash the whole
    // string is the body (a bare prefix without its terminator).
    var body = slash >= 0 ? prefix[..slash] : prefix;
    var labels = body.Split('.');
    return labels.Length >= 2 && ReservedSecondLabels.Contains(labels[1]);
  }

  /// <summary>
  /// Returns <c>true</c> if <paramref name="name"/> is a valid <c>_meta</c> key name. An empty
  /// name is valid (it occurs when a prefix is present and nothing follows the slash). A
  /// non-empty name MUST begin and end with an alphanumeric; interior characters MAY be
  /// alphanumerics, hyphens, underscores, or dots. (R-2.6.2-g, R-2.6.2-h, AC-02.18)
  /// </summary>
  /// <param name="name">The candidate name (the portion after the prefix).</param>
  /// <returns><c>true</c> when the name is empty or well-formed.</returns>
  public static bool IsValidMetaKeyName(string name)
  {
    ArgumentNullException.ThrowIfNull(name);
    return name.Length == 0 || NameRegex().IsMatch(name);
  }

  /// <summary>The prefix (with trailing slash) and name parts of a parsed <c>_meta</c> key.</summary>
  /// <param name="Prefix">The prefix including the trailing slash, or <c>null</c> when the key has no slash.</param>
  /// <param name="Name">Everything after the first slash, or the whole key when there is no slash.</param>
  public readonly record struct ParsedMetaKey(string? Prefix, string Name);

  /// <summary>
  /// Splits a <c>_meta</c> key into its prefix (if any) and name using the <em>first</em>
  /// slash as the separator. The prefix includes the trailing slash; the name is everything
  /// after it. A key with no slash has a <c>null</c> prefix and the whole key as its name.
  /// </summary>
  /// <param name="key">The key to split.</param>
  /// <returns>The parsed prefix and name.</returns>
  /// <remarks>
  /// Because only the first slash separates the two parts, a key such as <c>a.b/c/d</c> parses
  /// to <c>{ Prefix = "a.b/", Name = "c/d" }</c>.
  /// </remarks>
  public static ParsedMetaKey ParseMetaKey(string key)
  {
    ArgumentNullException.ThrowIfNull(key);
    var slash = key.IndexOf('/');
    return slash < 0
      ? new ParsedMetaKey(null, key)
      : new ParsedMetaKey(key[..(slash + 1)], key[(slash + 1)..]);
  }

  /// <summary>
  /// Returns <c>true</c> if <paramref name="key"/> is a syntactically valid <c>_meta</c> key
  /// AND its prefix (if present) is not reserved (§2.6.2 / §4.2, R-2.6.2-i, R-2.6.2-j).
  /// </summary>
  /// <param name="key">The candidate key.</param>
  /// <returns><c>true</c> when the key is well-formed and not under a reserved prefix.</returns>
  /// <remarks>
  /// This folds reserved-prefix rejection into validity exactly as the TypeScript
  /// <c>isValidMetaKey</c> does: a third-party key under a reserved prefix such as
  /// <c>io.modelcontextprotocol/something</c> is NOT valid for an arbitrary caller and returns
  /// <c>false</c>. The reserved bare trace-context keys (<c>traceparent</c>, <c>tracestate</c>,
  /// <c>baggage</c>) are always valid because the spec permits them. Use
  /// <see cref="IsReservedMetaKeyPrefix"/> directly when you need to test reservation
  /// independently of validity.
  /// </remarks>
  public static bool IsValidKey(string key)
  {
    ArgumentNullException.ThrowIfNull(key);
    if (TraceContextKeys.Contains(key)) return true;

    var (prefix, name) = ParseMetaKey(key);
    if (prefix is not null)
    {
      if (!IsValidMetaKeyPrefix(prefix)) return false;
      if (IsReservedMetaKeyPrefix(prefix)) return false;
    }
    return IsValidMetaKeyName(name);
  }

  /// <summary>
  /// Returns <c>true</c> if <paramref name="key"/> sits under a protocol-reserved prefix —
  /// its second label is <c>modelcontextprotocol</c> or <c>mcp</c> (§4.2). Third parties MUST
  /// NOT mint keys under such a prefix.
  /// </summary>
  /// <param name="key">The candidate key (or prefix).</param>
  /// <returns><c>true</c> when the key's prefix is protocol-reserved.</returns>
  /// <remarks>
  /// Retained for callers that pass a full key and only want the reservation test (without the
  /// stricter validity contract of <see cref="IsValidKey"/>). It is an alias for
  /// <see cref="IsReservedMetaKeyPrefix"/> with the prior full-key semantics: a key without a
  /// non-empty prefix (a bare key or a leading slash) is never reserved.
  /// </remarks>
  public static bool IsReservedPrefix(string key)
  {
    ArgumentNullException.ThrowIfNull(key);
    var slash = key.IndexOf('/');
    // A leading slash (empty prefix) or no slash means there is no prefix to reserve.
    if (slash <= 0) return false;
    return IsReservedMetaKeyPrefix(key);
  }

  // ─── W3C trace-context value validators ─────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> conforms to the W3C <c>traceparent</c>
  /// format <c>{version}-{traceId}-{parentId}-{flags}</c> (<c>00-32hex-16hex-2hex</c>), with
  /// lowercase hex only. (R-2.6.2-i, AC-02.19)
  /// </summary>
  /// <param name="value">The candidate <c>traceparent</c> value.</param>
  /// <returns><c>true</c> when the value is a well-formed <c>traceparent</c>.</returns>
  public static bool IsValidTraceparent(string value)
  {
    ArgumentNullException.ThrowIfNull(value);
    return TraceparentRegex().IsMatch(value);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> conforms to the W3C Trace Context
  /// <c>tracestate</c> grammar: each list member is a <c>simple-key=value</c> or
  /// <c>tenant-id@system-id=value</c> pair, with up to 32 comma-separated members and a total
  /// length of at most 512 characters. (R-4.2-l, AC-05.15)
  /// </summary>
  /// <param name="value">The candidate <c>tracestate</c> value.</param>
  /// <returns><c>true</c> when the value is a well-formed <c>tracestate</c>.</returns>
  public static bool IsValidTracestate(string value)
  {
    ArgumentNullException.ThrowIfNull(value);
    if (value.Length == 0 || value.Length > 512) return false;
    var members = TracestateMemberSeparatorRegex().Split(value);
    if (members.Length > 32) return false;
    foreach (var member in members)
    {
      if (!IsValidTracestateEntry(member)) return false;
    }
    return true;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> conforms to the W3C Baggage grammar:
  /// each comma-separated list member is <c>token "=" *baggage-octet</c> with optional
  /// semicolon-separated properties. (R-4.2-m, AC-05.15)
  /// </summary>
  /// <param name="value">The candidate <c>baggage</c> value.</param>
  /// <returns><c>true</c> when the value is well-formed baggage.</returns>
  public static bool IsValidBaggage(string value)
  {
    ArgumentNullException.ThrowIfNull(value);
    if (value.Length == 0) return false;
    var members = TracestateMemberSeparatorRegex().Split(value);
    foreach (var member in members)
    {
      if (!IsValidBaggageMember(member)) return false;
    }
    return true;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a valid W3C <c>tracestate</c> OR
  /// <c>baggage</c> value — accepted if either grammar matches. (R-2.6.2-i)
  /// </summary>
  /// <param name="value">The candidate trace-context value.</param>
  /// <returns><c>true</c> when the value is a valid <c>tracestate</c> or <c>baggage</c>.</returns>
  public static bool IsValidTraceContextValue(string value)
  {
    ArgumentNullException.ThrowIfNull(value);
    return IsValidTracestate(value) || IsValidBaggage(value);
  }

  // ─── tracestate helpers ─────────────────────────────────────────────────────

  private static bool IsValidTracestateKey(string key) =>
    TracestateSimpleKeyRegex().IsMatch(key) || TracestateMultiKeyRegex().IsMatch(key);

  private static bool IsValidTracestateValue(string v) =>
    // value = 0*255(chr) nblkchar → 1–256 chars, every char a chr, last char an nblkchar.
    v.Length >= 1 &&
    v.Length <= 256 &&
    TracestateChrRegex().IsMatch(v) &&
    TracestateNblkcharLastRegex().IsMatch(v);

  private static bool IsValidTracestateEntry(string entry)
  {
    var eq = entry.IndexOf('=');
    if (eq <= 0) return false;
    return IsValidTracestateKey(entry[..eq]) && IsValidTracestateValue(entry[(eq + 1)..]);
  }

  // ─── baggage helpers ────────────────────────────────────────────────────────

  private static bool IsValidBaggageMember(string member)
  {
    var semi = member.IndexOf(';');
    var keyVal = semi < 0 ? member : member[..semi];
    var propStr = semi < 0 ? string.Empty : member[(semi + 1)..];

    var eq = keyVal.IndexOf('=');
    if (eq <= 0) return false;
    if (!BaggageTokenRegex().IsMatch(keyVal[..eq])) return false;
    if (!BaggageOctetRegex().IsMatch(keyVal[(eq + 1)..])) return false;

    if (propStr.Length != 0)
    {
      foreach (var prop in propStr.Split(';'))
      {
        var t = prop.Trim();
        if (t.Length == 0) return false;
        var pEq = t.IndexOf('=');
        if (pEq < 0)
        {
          if (!BaggageTokenRegex().IsMatch(t)) return false;
        }
        else
        {
          if (!BaggageTokenRegex().IsMatch(t[..pEq])) return false;
          if (!BaggageOctetRegex().IsMatch(t[(pEq + 1)..])) return false;
        }
      }
    }

    return true;
  }

  // ─── Regexes ────────────────────────────────────────────────────────────────

  // A prefix is one or more labels separated by '.', terminated by a single '/'.
  // Each label starts with an ASCII letter and ends with a letter or digit; interior
  // characters may be letters, digits, or hyphens.
  [GeneratedRegex(@"^([A-Za-z]([A-Za-z0-9-]*[A-Za-z0-9])?)(\.([A-Za-z]([A-Za-z0-9-]*[A-Za-z0-9])?))*/$")]
  private static partial Regex PrefixRegex();

  // A non-empty name begins and ends with an alphanumeric character; interior characters
  // may be alphanumeric, hyphen, underscore, or dot.
  [GeneratedRegex(@"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$")]
  private static partial Regex NameRegex();

  // traceparent: 00-{32 lowercase hex}-{16 lowercase hex}-{2 lowercase hex}, anchored.
  [GeneratedRegex("^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$")]
  private static partial Regex TraceparentRegex();

  // List-member separator for tracestate/baggage: a comma with optional surrounding spaces/tabs.
  [GeneratedRegex(@"[ \t]*,[ \t]*")]
  private static partial Regex TracestateMemberSeparatorRegex();

  // tracestate simple key: one lowercase letter then 0–255 of [a-z0-9_\-*/].
  [GeneratedRegex(@"^[a-z][a-z0-9_\-*/]{0,255}$")]
  private static partial Regex TracestateSimpleKeyRegex();

  // tracestate multi-tenant key: tenant-id (1–241) + "@" + system-id (1–14).
  [GeneratedRegex(@"^[a-z0-9][a-z0-9_\-*/]{0,240}@[a-z][a-z0-9_\-*/]{0,13}$")]
  private static partial Regex TracestateMultiKeyRegex();

  // tracestate chr = %x20 / nblkchar: printable ASCII except comma (0x2C) and '?' (0x3F).
  // Ranges: 0x20–0x2B, 0x2D–0x3E, 0x40–0x7E (hex escapes mirror the TypeScript regex exactly).
  [GeneratedRegex(@"^[\x20-\x2b\x2d-\x3e\x40-\x7e]+$")]
  private static partial Regex TracestateChrRegex();

  // tracestate nblkchar (chr minus space): the value's last char must be one of
  // 0x21–0x2B, 0x2D–0x3E, 0x40–0x7E.
  [GeneratedRegex(@"[\x21-\x2b\x2d-\x3e\x40-\x7e]$")]
  private static partial Regex TracestateNblkcharLastRegex();

  // RFC 7230 token: one or more tchar.
  [GeneratedRegex(@"^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$")]
  private static partial Regex BaggageTokenRegex();

  // baggage-octet: printable ASCII excluding DQUOTE (0x22), comma (0x2C), semicolon (0x3B),
  // and backslash (0x5C). Ranges: 0x21, 0x23–0x2B, 0x2D–0x3A, 0x3C–0x5B, 0x5D–0x7E.
  [GeneratedRegex(@"^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$")]
  private static partial Regex BaggageOctetRegex();
}
