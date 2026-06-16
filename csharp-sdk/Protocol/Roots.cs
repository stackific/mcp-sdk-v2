using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

// This file IS the Deprecated-but-supported Roots feature (§21.1); referencing the [Obsolete]
// Root / ListRootsResult types throughout is deliberate backward-compatibility implementation.
#pragma warning disable CS0618

/// <summary>
/// A filesystem "root" — a directory or file the client considers relevant — exposed to a server
/// as informational guidance (spec §21.1.5).
/// </summary>
/// <remarks>
/// This type belongs to the <b>Deprecated</b> Roots capability (spec §21.1). Implementations SHOULD
/// NOT adopt it for new functionality; it remains defined for interoperability. Prefer conveying
/// relevant directories and files through tool input parameters (§16), resource URIs (§17), or
/// server configuration. Roots are <em>not</em> an access-control mechanism: the protocol does not
/// enforce that a server confines its operations to the listed roots.
/// </remarks>
[Obsolete("Roots (roots/list) is Deprecated (spec §21.1): prefer tool input parameters, resource URIs, or server configuration. Still accepted and round-tripped for backward compatibility.")]
public sealed record Root
{
  /// <summary>
  /// REQUIRED. The URI identifying the root (spec §21.1.5). In this revision it MUST use the
  /// <c>file</c> scheme — that is, it MUST begin with <c>file://</c> — and MUST be a syntactically
  /// valid URI [RFC3986]. A receiver MAY reject or ignore a root whose URI does not use the
  /// <c>file</c> scheme.
  /// </summary>
  public required string Uri { get; init; }

  /// <summary>
  /// OPTIONAL. A human-readable name for the root, suitable for display or for referencing the root
  /// elsewhere in an application (spec §21.1.5). When absent, no display name is implied.
  /// </summary>
  public string? Name { get; init; }

  /// <summary>
  /// OPTIONAL. Implementation-defined metadata attached to the root (spec §21.1.5/§4). A receiver
  /// MUST ignore <c>_meta</c> members it does not recognize.
  /// </summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// The result a client supplies, on retry, in response to a <c>roots/list</c> input request
/// (spec §21.1.5). The server requests the listing by returning an input-required result carrying
/// the <c>roots/list</c> input request; the client answers by retrying the originating request with
/// this result attached (the multi-round-trip mechanism of §11).
/// </summary>
/// <remarks>
/// This type belongs to the <b>Deprecated</b> Roots capability (spec §21.1) and is retained for
/// interoperability only.
/// </remarks>
[Obsolete("Roots (roots/list) is Deprecated (spec §21.1). Still accepted and round-tripped for backward compatibility.")]
public sealed record ListRootsResult
{
  /// <summary>The JSON-RPC method name of the input request answered by this result (spec §21.1.4).</summary>
  public const string Method = "roots/list";

  /// <summary>
  /// REQUIRED. The array of roots the client exposes (spec §21.1.5). The array MAY be empty
  /// (<c>[]</c>) to indicate the client exposes no roots, but it MUST be present even when empty.
  /// </summary>
  public required IReadOnlyList<Root> Roots { get; init; }
}

/// <summary>
/// The §21.1.5 behavioral layer for the <b>Deprecated</b> Roots capability — the C# counterpart of
/// the TypeScript <c>protocol/roots.ts</c> validation helpers. The wire records
/// (<see cref="Root"/>, <see cref="ListRootsResult"/>) stay permissive so any well-formed payload
/// round-trips; this static class adds the §21.1.5 MUST/SHOULD checks the spec layers on top:
/// the <c>file://</c> + RFC 3986 <c>uri</c> constraint (R-21.1.5-b/d), the path-traversal guard
/// (R-21.1.5-i), the consent/scope assembly pipeline (R-21.1.5-g/h), the non-<c>file</c>-scheme
/// disposition (R-21.1.5-c), and the server-side derived-path containment check (R-21.1.5-k).
/// </summary>
/// <remarks>
/// Roots are informational guidance, NOT an access-control boundary: the protocol does not enforce
/// that a server confines itself to the listed roots (R-21.1.5-l). The constants/predicates here
/// let server code assert it never relies on protocol-level enforcement.
/// </remarks>
public static class RootsValidation
{
  /// <summary>The exact <c>roots/list</c> method string; MUST match exactly, case-sensitively (R-21.1.4-a; AC-32.8).</summary>
  public const string RootsListMethod = "roots/list";

  /// <summary>
  /// The <c>notifications/roots/list_changed</c> method name. ⚠️ UNSUPPORTED in this revision: no
  /// <c>listChanged</c> sub-flag is defined for <c>roots</c>, so a client MUST NOT rely on it
  /// (R-21.1.2-c; AC-32.5). Named only so a receiver can recognize and ignore it.
  /// </summary>
  public const string RootsListChangedNotificationMethod = "notifications/roots/list_changed";

  /// <summary><c>false</c> — this revision defines NO <c>listChanged</c> mechanism for <c>roots</c> (R-21.1.2-c; AC-32.5).</summary>
  public const bool RootsListChangedSupported = false;

  /// <summary>
  /// <c>false</c> — a server MUST NOT assume the protocol enforces root boundaries on its behalf;
  /// roots are informational guidance, not access control (R-21.1.5-l; AC-32.18).
  /// </summary>
  public const bool ProtocolEnforcesRootBoundaries = false;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is EXACTLY <c>"roots/list"</c>
  /// (case-sensitive). A value differing only in case (for example <c>"Roots/List"</c>) is NOT
  /// valid. Mirrors TS <c>isRootsListMethod</c>. (R-21.1.4-a; AC-32.8)
  /// </summary>
  /// <param name="value">The candidate method name.</param>
  /// <returns><c>true</c> when the value is exactly <c>roots/list</c>.</returns>
  public static bool IsRootsListMethod(string? value) => string.Equals(value, RootsListMethod, StringComparison.Ordinal);

  /// <summary>
  /// Returns <c>false</c> for every input — a client MUST NOT rely on a <c>listChanged</c>-style
  /// mechanism for roots in this revision, regardless of capability contents. Mirrors TS
  /// <c>mayRelyOnRootsListChanged</c>. (R-21.1.2-c; AC-32.5)
  /// </summary>
  /// <param name="_clientCaps">The client capabilities (unused; no enabling sub-flag exists).</param>
  /// <returns>Always <c>false</c>.</returns>
  public static bool MayRelyOnRootsListChanged(JsonObject? _clientCaps = null) => RootsListChangedSupported;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="uri"/> is a syntactically valid URI per RFC 3986 AND
  /// uses the <c>file</c> scheme (begins with <c>file://</c>). A non-<c>file</c> scheme, an empty
  /// value, or a malformed URI all return <c>false</c>. Mirrors TS <c>isValidFileUri</c>.
  /// (R-21.1.5-b, R-21.1.5-d; AC-32.11)
  /// </summary>
  /// <remarks>
  /// The check mirrors the TypeScript WHATWG <c>URL</c> path: the value MUST literally begin with
  /// <c>file://</c> (scheme + authority marker), then parse as an absolute URI whose scheme is
  /// <c>file</c>. <see cref="Uri.TryCreate(string, UriKind, out Uri)"/> with
  /// <see cref="UriKind.Absolute"/> is RFC 3986-compatible and rejects malformed inputs (for
  /// example an unescaped space) just as the WHATWG parser does.
  /// </remarks>
  /// <param name="uri">The candidate URI.</param>
  /// <returns><c>true</c> when the value is a valid <c>file://</c> URI.</returns>
  public static bool IsValidFileUri(string? uri)
  {
    if (string.IsNullOrEmpty(uri)) return false;
    // MUST begin with the `file://` scheme+authority marker. (R-21.1.5-b)
    if (!uri.StartsWith("file://", StringComparison.Ordinal)) return false;
    // RFC 3986 syntactic validity; an absolute URI whose scheme is exactly `file`. (R-21.1.5-d)
    if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed)) return false;
    return string.Equals(parsed.Scheme, "file", StringComparison.Ordinal);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="uri"/>, after passing <see cref="IsValidFileUri"/>,
  /// shows NO path-traversal artifacts — no <c>..</c> path segment and no percent-encoded <c>..</c>
  /// (<c>%2e%2e</c>, case-insensitively). Mirrors TS <c>isPathTraversalSafe</c>.
  /// (R-21.1.5-i; AC-32.16)
  /// </summary>
  /// <remarks>
  /// The check inspects the RAW input rather than a parsed/normalized path, because URI normalizers
  /// silently collapse <c>..</c> segments — so <c>file:///home/../etc</c> would resolve to
  /// <c>/etc</c> and hide the artifact. We scan the raw path portion's segments, decoding each once
  /// to catch percent-encoded dot-dot. A malformed escape is itself treated as unsafe.
  /// </remarks>
  /// <param name="uri">The candidate URI.</param>
  /// <returns><c>true</c> when the URI is a valid <c>file://</c> URI free of traversal artifacts.</returns>
  public static bool IsPathTraversalSafe(string? uri)
  {
    if (!IsValidFileUri(uri)) return false;
    // Strip the `file://` marker, then drop the authority (up to the first `/`) to isolate the path.
    var afterScheme = uri!["file://".Length..];
    var firstSlash = afterScheme.IndexOf('/');
    if (firstSlash == -1) return true; // no path portion (for example `file://host`)
    var rawPath = afterScheme[firstSlash..];
    foreach (var segment in rawPath.Split('/'))
    {
      string decoded;
      try
      {
        decoded = Uri.UnescapeDataString(segment);
      }
      catch (Exception)
      {
        // A malformed escape sequence is itself suspicious — treat as unsafe.
        return false;
      }
      if (decoded == "..") return false;
    }
    return true;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="root"/> satisfies the §21.1 <c>uri</c> constraints:
  /// a present <c>uri</c> that is a valid <c>file://</c> RFC 3986 URI. Mirrors TS <c>parseRoot</c>
  /// (the success branch). (R-21.1.5-b, R-21.1.5-d; AC-32.11)
  /// </summary>
  /// <param name="root">The candidate root.</param>
  /// <returns><c>true</c> when the root's <c>uri</c> is a valid <c>file://</c> URI.</returns>
  public static bool IsValidRoot(Root root)
  {
    ArgumentNullException.ThrowIfNull(root);
    return IsValidFileUri(root.Uri);
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="result"/> is a valid strict <see cref="ListRootsResult"/>:
  /// <c>roots</c> is present (MAY be empty) and every entry has a valid <c>file://</c> <c>uri</c>.
  /// Mirrors TS <c>parseStrictListRootsResult</c>. (R-21.1.5-a, R-21.1.5-b, R-21.1.5-d; AC-32.10, AC-32.11)
  /// </summary>
  /// <param name="result">The candidate result.</param>
  /// <returns><c>true</c> when every root is valid.</returns>
  public static bool IsValidStrictListRootsResult(ListRootsResult result)
  {
    ArgumentNullException.ThrowIfNull(result);
    foreach (var root in result.Roots)
    {
      if (!IsValidRoot(root)) return false;
    }
    return true;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="disposition"/> is a CONFORMANT way to handle a root
  /// whose <c>uri</c> is not <c>file</c>-scheme: a receiver MAY either <see cref="NonFileRootDisposition.Reject"/>
  /// it or <see cref="NonFileRootDisposition.Ignore"/> it. Mirrors TS <c>isConformantNonFileDisposition</c>
  /// (here the enum already constrains the domain, so this always returns <c>true</c>). (R-21.1.5-c; AC-32.12)
  /// </summary>
  /// <param name="disposition">The chosen disposition.</param>
  /// <returns><c>true</c> for either conformant disposition.</returns>
  public static bool IsConformantNonFileDisposition(NonFileRootDisposition disposition) =>
    disposition is NonFileRootDisposition.Reject or NonFileRootDisposition.Ignore;

  /// <summary>
  /// Applies a receiver's chosen <paramref name="disposition"/> to a candidate root <paramref name="uri"/>
  /// that does NOT use the <c>file</c> scheme, returning whether the root is kept. A valid
  /// <c>file://</c> URI is always kept; a non-<c>file</c> URI is dropped under EITHER disposition
  /// (they differ only in whether the receiver surfaces an error elsewhere). Mirrors TS
  /// <c>applyNonFileDisposition</c>. (R-21.1.5-c; AC-32.12)
  /// </summary>
  /// <param name="uri">The candidate root URI.</param>
  /// <param name="disposition">The receiver's chosen disposition.</param>
  /// <returns>Whether the root is kept, paired with the disposition applied.</returns>
  public static NonFileDispositionOutcome ApplyNonFileDisposition(string? uri, NonFileRootDisposition disposition) =>
    new(IsValidFileUri(uri), disposition);

  /// <summary>
  /// Assembles a <see cref="ListRootsResult"/> a client supplies on retry, enforcing the
  /// client-side consent, scope, and validation obligations. A root is INCLUDED only when it is
  /// in-scope (R-21.1.5-g), consented (R-21.1.5-h), URI-valid (R-21.1.5-b/d), AND traversal-safe
  /// (R-21.1.5-i); every excluded candidate is reported with its reason. When nothing qualifies the
  /// result is the conformant empty listing. Mirrors TS <c>assembleListRootsResult</c>.
  /// (R-21.1.5-a, -g, -h, -i; AC-32.10, AC-32.15, AC-32.16)
  /// </summary>
  /// <param name="candidates">The roots the client is considering exposing.</param>
  /// <returns>The validated listing plus the excluded candidates and their reasons.</returns>
  public static RootsAssembly AssembleListRootsResult(IReadOnlyList<RootCandidate> candidates)
  {
    ArgumentNullException.ThrowIfNull(candidates);
    var included = new List<Root>();
    var excluded = new List<ExcludedRoot>();

    foreach (var candidate in candidates)
    {
      if (!candidate.InScope)
      {
        excluded.Add(new ExcludedRoot(candidate.Root, RootExclusionReason.NotInScope));
        continue;
      }
      if (!candidate.Consented)
      {
        excluded.Add(new ExcludedRoot(candidate.Root, RootExclusionReason.NoConsent));
        continue;
      }
      if (!IsValidFileUri(candidate.Root.Uri))
      {
        excluded.Add(new ExcludedRoot(candidate.Root, RootExclusionReason.InvalidUri));
        continue;
      }
      if (!IsPathTraversalSafe(candidate.Root.Uri))
      {
        excluded.Add(new ExcludedRoot(candidate.Root, RootExclusionReason.PathTraversal));
        continue;
      }
      included.Add(candidate.Root);
    }

    return new RootsAssembly(new ListRootsResult { Roots = included }, excluded);
  }

  /// <summary>
  /// Returns <c>true</c> — a server SHOULD tolerate a previously-reported root that has since become
  /// unavailable; it MUST NOT fail solely because a reported root is now gone. Mirrors TS
  /// <c>shouldTolerateUnavailableRoot</c>. (R-21.1.5-j; AC-32.17)
  /// </summary>
  /// <param name="_root">The previously-reported root (unused; tolerance is unconditional).</param>
  /// <returns>Always <c>true</c>.</returns>
  public static bool ShouldTolerateUnavailableRoot(Root _root) => true;

  /// <summary>
  /// Returns <c>false</c> — confirms the protocol does NOT enforce root boundaries; a server MUST
  /// validate derived paths itself. Mirrors TS <c>protocolEnforcesRootBoundaries</c>.
  /// (R-21.1.5-l; AC-32.18)
  /// </summary>
  /// <returns>Always <c>false</c>.</returns>
  public static bool ProtocolEnforcesRootBoundariesFn() => ProtocolEnforcesRootBoundaries;

  /// <summary>
  /// Validates a server-derived filesystem path against the reported roots, so the server does NOT
  /// rely on protocol-level enforcement. Returns <c>true</c> only when <paramref name="derivedUri"/>
  /// is a valid <c>file://</c> URI whose path is contained within (equal to, or a descendant of) at
  /// least one reported root's path. Containment compares decoded path segments (so <c>/a/b</c>
  /// contains <c>/a/b/c</c> but not <c>/a/bc</c>); roots whose own <c>uri</c> is invalid are skipped.
  /// Mirrors TS <c>isPathWithinReportedRoots</c>. (R-21.1.5-k, R-21.1.5-l; AC-32.18)
  /// </summary>
  /// <param name="derivedUri">The <c>file://</c> URI the server derived from the request.</param>
  /// <param name="reportedRoots">The roots the client reported.</param>
  /// <returns><c>true</c> when the derived path is within a reported root.</returns>
  public static bool IsPathWithinReportedRoots(string? derivedUri, IReadOnlyList<Root> reportedRoots)
  {
    ArgumentNullException.ThrowIfNull(reportedRoots);
    if (!IsValidFileUri(derivedUri)) return false;
    var derivedSegments = DecodedSegments(new Uri(derivedUri!).AbsolutePath);

    foreach (var root in reportedRoots)
    {
      if (!IsValidFileUri(root.Uri)) continue;
      var rootSegments = DecodedSegments(new Uri(root.Uri).AbsolutePath);
      if (IsPrefixPath(rootSegments, derivedSegments)) return true;
    }
    return false;
  }

  /// <summary>Splits a URL path into non-empty, percent-decoded path segments.</summary>
  /// <param name="path">The URI path component.</param>
  /// <returns>The decoded segments.</returns>
  private static List<string> DecodedSegments(string path)
  {
    var segments = new List<string>();
    foreach (var raw in path.Split('/'))
    {
      if (raw.Length == 0) continue;
      try
      {
        segments.Add(Uri.UnescapeDataString(raw));
      }
      catch (Exception)
      {
        segments.Add(raw);
      }
    }
    return segments;
  }

  /// <summary>Returns <c>true</c> when <paramref name="prefix"/> is a path-prefix of (or equal to) <paramref name="path"/>.</summary>
  /// <param name="prefix">The candidate prefix segments.</param>
  /// <param name="path">The full path segments.</param>
  /// <returns><c>true</c> when the segments form a prefix.</returns>
  private static bool IsPrefixPath(IReadOnlyList<string> prefix, IReadOnlyList<string> path)
  {
    if (prefix.Count > path.Count) return false;
    for (var i = 0; i < prefix.Count; i++)
    {
      if (!string.Equals(prefix[i], path[i], StringComparison.Ordinal)) return false;
    }
    return true;
  }
}

/// <summary>A receiver's permitted disposition of a root whose <c>uri</c> is not <c>file</c>-scheme (R-21.1.5-c).</summary>
public enum NonFileRootDisposition
{
  /// <summary>Reject the non-<c>file</c> root (surface an error).</summary>
  Reject,

  /// <summary>Silently ignore the non-<c>file</c> root.</summary>
  Ignore,
}

/// <summary>The outcome of <see cref="RootsValidation.ApplyNonFileDisposition"/>: whether the root is kept under the chosen disposition.</summary>
/// <param name="Kept">Whether the root is retained for consideration.</param>
/// <param name="Disposition">The disposition that was applied.</param>
public readonly record struct NonFileDispositionOutcome(bool Kept, NonFileRootDisposition Disposition);

/// <summary>Why a candidate root was excluded by <see cref="RootsValidation.AssembleListRootsResult"/> (§21.1.5).</summary>
public enum RootExclusionReason
{
  /// <summary>The client did not intend the server to treat the root as in-scope (R-21.1.5-g).</summary>
  NotInScope,

  /// <summary>The user did not consent to exposing the root (R-21.1.5-h).</summary>
  NoConsent,

  /// <summary>The root's <c>uri</c> is not a valid <c>file://</c> URI (R-21.1.5-b/d).</summary>
  InvalidUri,

  /// <summary>The root's <c>uri</c> shows a path-traversal artifact (R-21.1.5-i).</summary>
  PathTraversal,
}

/// <summary>A candidate root a client is considering exposing, paired with its consent and scope state (§21.1.5).</summary>
/// <param name="Root">The candidate root entry.</param>
/// <param name="Consented">Whether the user has consented to exposing this root (R-21.1.5-h).</param>
/// <param name="InScope">Whether the client intends the server to treat this root as in-scope (R-21.1.5-g).</param>
public sealed record RootCandidate(Root Root, bool Consented, bool InScope);

/// <summary>An excluded candidate root and the reason it was dropped during assembly (§21.1.5).</summary>
/// <param name="Root">The excluded root.</param>
/// <param name="Reason">Why it was excluded.</param>
public sealed record ExcludedRoot(Root Root, RootExclusionReason Reason);

/// <summary>The outcome of <see cref="RootsValidation.AssembleListRootsResult"/>: the validated listing plus the excluded candidates.</summary>
/// <param name="Result">The validated listing to supply as the <c>roots/list</c> input response.</param>
/// <param name="Excluded">The candidates excluded, each with its reason.</param>
public sealed record RootsAssembly(ListRootsResult Result, IReadOnlyList<ExcludedRoot> Excluded);
