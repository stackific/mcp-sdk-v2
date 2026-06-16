namespace Stackific.Mcp.Protocol;

/// <summary>
/// The MCP protocol revision implemented by this SDK (spec §5.1). Revision identifiers are
/// opaque, exactly-matched strings — never compared lexically or chronologically (§5.1).
/// </summary>
public static class ProtocolRevision
{
  /// <summary>The wire value of the revision this SDK speaks: <c>2026-07-28</c>.</summary>
  public const string Current = "2026-07-28";

  /// <summary>
  /// The revisions this SDK is willing to accept, most-preferred first. A server advertises
  /// this list as <c>supportedVersions</c> in discovery (§5.3.2); a client selects from it (§5.4).
  /// </summary>
  public static IReadOnlyList<string> Supported { get; } = [Current];

  /// <summary>Returns <c>true</c> if <paramref name="revision"/> is one this SDK supports (exact match, §5.1).</summary>
  /// <param name="revision">The candidate revision string.</param>
  /// <returns><c>true</c> when supported.</returns>
  public static bool IsSupported(string revision) =>
    Supported.Contains(revision, StringComparer.Ordinal);
}
