namespace Stackific.Mcp.Lifecycle;

/// <summary>
/// The registry of currently deprecated MCP features (spec §27.3) plus the out-of-band deprecation
/// warning emitter (§27.4). The C# counterpart of the TypeScript <c>lifecycle/registry.ts</c> module.
/// </summary>
/// <remarks>
/// The registry is a derived, consolidated view; the per-feature notices at the cross-referenced
/// defining sections are authoritative and resolve any conflict. New implementations SHOULD NOT adopt
/// the registered deprecated features, and existing implementations SHOULD migrate before each
/// feature's earliest removal (R-27.3-a, R-27.3-b).
/// </remarks>
public static class DeprecatedRegistry
{
  /// <summary>
  /// The consolidated registry of deprecated MCP features (spec §27.3): Roots (§21), Sampling (§21),
  /// the deprecated <c>includeContext</c> values (§21), the Logging capability (§15), the
  /// <c>io.modelcontextprotocol/logLevel</c> <c>_meta</c> key (§15), and Dynamic Client Registration
  /// (§23). The entries, ordering, migration notes, and earliest-removal dates mirror the TypeScript
  /// <c>DEPRECATED_REGISTRY</c> exactly.
  /// </summary>
  public static IReadOnlyList<DeprecatedRegistryEntry> Entries { get; } =
  [
    new()
    {
      Feature = "Roots capability",
      DefinedIn = "§21",
      MigrationNote = "No direct replacement; roots integration is now host-managed.",
      EarliestRemoval = "2026-07-28",
    },
    new()
    {
      Feature = "Sampling capability",
      DefinedIn = "§21",
      MigrationNote = "No direct replacement; use Elicitation (§20) for structured user input.",
      EarliestRemoval = "2026-07-28",
    },
    new()
    {
      Feature = "includeContext values \"thisServer\" and \"allServers\"",
      DefinedIn = "§21",
      MigrationNote = "No replacement; context management is now host-managed.",
      EarliestRemoval = "2026-07-28",
    },
    new()
    {
      Feature = "Logging capability",
      DefinedIn = "§15",
      MigrationNote =
        "For stdio (§8), write diagnostics to stderr; for general observability, " +
        "emit telemetry via an external observability framework.",
      EarliestRemoval = "2026-07-28",
    },
    new()
    {
      Feature = "io.modelcontextprotocol/logLevel _meta key",
      DefinedIn = "§15",
      MigrationNote = "See Logging capability migration note.",
      EarliestRemoval = "2026-07-28",
    },
    new()
    {
      Feature = "Dynamic Client Registration",
      DefinedIn = "§23",
      MigrationNote = "Use static OAuth 2.0 client registration instead.",
      EarliestRemoval = "2026-07-28",
    },
  ];

  /// <summary>
  /// Looks up a feature in the deprecated registry by exact name, returning the entry or <c>null</c>
  /// when it is not registered (spec §27.3). Matches the TypeScript <c>findDeprecatedEntry</c>.
  /// </summary>
  /// <param name="feature">The feature name to look up (exact, case-sensitive match).</param>
  /// <returns>The matching <see cref="DeprecatedRegistryEntry"/>, or <c>null</c> when absent.</returns>
  public static DeprecatedRegistryEntry? Find(string feature)
  {
    ArgumentNullException.ThrowIfNull(feature);
    foreach (var entry in Entries)
    {
      if (string.Equals(entry.Feature, feature, StringComparison.Ordinal))
      {
        return entry;
      }
    }
    return null;
  }

  /// <summary>
  /// Emits a runtime deprecation warning through the environment-idiomatic, out-of-band channel
  /// (stderr) (spec §27.4, R-27.4-d).
  /// </summary>
  /// <remarks>
  /// IMPORTANT: this is advisory only. It MUST NOT inject the warning into the protocol wire format
  /// and does not alter message semantics (R-27.4-e). It is the C# counterpart of the TypeScript
  /// <c>emitDeprecationWarning</c>, which routes to <c>console.warn</c> (stderr). A custom
  /// <paramref name="writer"/> may be supplied (for tests or alternative sinks); when omitted, the
  /// warning is written to <see cref="Console.Error"/>.
  /// </remarks>
  /// <param name="feature">The name of the deprecated feature being exercised.</param>
  /// <param name="migration">The documented migration guidance.</param>
  /// <param name="writer">An optional sink; defaults to <see cref="Console.Error"/> when <c>null</c>.</param>
  public static void EmitWarning(string feature, string migration, TextWriter? writer = null)
  {
    ArgumentNullException.ThrowIfNull(feature);
    ArgumentNullException.ThrowIfNull(migration);
    var sink = writer ?? Console.Error;
    sink.WriteLine($"[MCP] Deprecated feature used: \"{feature}\". Migration: {migration}");
  }
}
