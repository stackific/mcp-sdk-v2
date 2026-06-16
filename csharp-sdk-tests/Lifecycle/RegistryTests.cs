using System.Text.RegularExpressions;

using Stackific.Mcp.Lifecycle;

namespace Stackific.Mcp.Tests.Lifecycle;

/// <summary>
/// Coverage for the deprecated-feature registry and the out-of-band warning emitter (spec §27.3/§27.4),
/// mirroring the TypeScript <c>lifecycle/registry.test.ts</c> scenarios (AC-43.21–AC-43.33): the
/// registry contents and field shapes, the six known deprecated features, ISO-8601 earliest-removal
/// dates, lookup, and the advisory warning emission.
/// </summary>
public sealed partial class RegistryTests
{
  // ----- Registry structure (AC-43.21, AC-43.22, AC-43.23) -----

  [Fact]
  public void Registry_is_non_empty()
  {
    Assert.NotEmpty(DeprecatedRegistry.Entries);
  }

  [Fact]
  public void Every_entry_has_required_non_empty_fields()
  {
    foreach (var entry in DeprecatedRegistry.Entries)
    {
      Assert.False(string.IsNullOrEmpty(entry.Feature));
      Assert.False(string.IsNullOrEmpty(entry.DefinedIn));
      Assert.False(string.IsNullOrEmpty(entry.MigrationNote));
      Assert.False(string.IsNullOrEmpty(entry.EarliestRemoval));
    }
  }

  [Fact]
  public void Every_earliest_removal_is_an_iso_8601_date()
  {
    foreach (var entry in DeprecatedRegistry.Entries)
    {
      Assert.Matches(IsoDateRegex(), entry.EarliestRemoval);
    }
  }

  [Fact]
  public void Registry_has_the_six_known_entries()
  {
    Assert.Equal(6, DeprecatedRegistry.Entries.Count);
  }

  // ----- Known deprecated features (AC-43.24 to AC-43.29) -----

  [Fact]
  public void Contains_the_Roots_capability()
  {
    Assert.NotNull(DeprecatedRegistry.Find("Roots capability"));
  }

  [Fact]
  public void Contains_the_Sampling_capability()
  {
    Assert.NotNull(DeprecatedRegistry.Find("Sampling capability"));
  }

  [Fact]
  public void Contains_the_includeContext_values()
  {
    Assert.Contains(DeprecatedRegistry.Entries, e =>
      e.Feature.Contains("includeContext", StringComparison.OrdinalIgnoreCase));
  }

  [Fact]
  public void Contains_the_Logging_capability()
  {
    Assert.Contains(DeprecatedRegistry.Entries, e =>
      e.Feature.Contains("Logging capability", StringComparison.OrdinalIgnoreCase));
  }

  [Fact]
  public void Contains_the_logLevel_meta_key()
  {
    Assert.Contains(DeprecatedRegistry.Entries, e => e.Feature.Contains("logLevel", StringComparison.Ordinal));
  }

  [Fact]
  public void Contains_Dynamic_Client_Registration()
  {
    Assert.Contains(DeprecatedRegistry.Entries, e =>
      e.Feature.Contains("Dynamic Client Registration", StringComparison.OrdinalIgnoreCase));
  }

  // ----- Find (lookup) -----

  [Fact]
  public void Find_returns_the_matching_entry()
  {
    var entry = DeprecatedRegistry.Find("Roots capability");
    Assert.NotNull(entry);
    Assert.Equal("Roots capability", entry!.Feature);
    Assert.Equal("§21", entry.DefinedIn);
  }

  [Fact]
  public void Find_returns_null_for_an_unknown_feature()
  {
    Assert.Null(DeprecatedRegistry.Find("nonexistent-feature-xyz"));
  }

  [Fact]
  public void Find_is_case_sensitive()
  {
    // Exact, case-sensitive match (mirrors the TS strict-equality lookup).
    Assert.Null(DeprecatedRegistry.Find("roots capability"));
  }

  // ----- EmitWarning (AC-43.30 to AC-43.33) -----

  [Fact]
  public void EmitWarning_writes_to_the_supplied_sink()
  {
    using var writer = new StringWriter();
    DeprecatedRegistry.EmitWarning("TestFeature", "Use newFeature instead.", writer);
    Assert.NotEmpty(writer.ToString());
  }

  [Fact]
  public void EmitWarning_message_includes_the_feature_name()
  {
    using var writer = new StringWriter();
    DeprecatedRegistry.EmitWarning("TestFeature", "Use newFeature instead.", writer);
    Assert.Contains("TestFeature", writer.ToString());
  }

  [Fact]
  public void EmitWarning_message_includes_the_migration_note()
  {
    using var writer = new StringWriter();
    DeprecatedRegistry.EmitWarning("TestFeature", "Use newFeature instead.", writer);
    Assert.Contains("Use newFeature instead.", writer.ToString());
  }

  [Fact]
  public void EmitWarning_does_not_inject_into_the_wire_format()
  {
    // The warning is advisory and out-of-band: it goes to the writer, returns void, and never
    // appears as a protocol payload. We assert it is a plain human-readable line, not JSON-RPC.
    using var writer = new StringWriter();
    DeprecatedRegistry.EmitWarning("Roots capability", "host-managed", writer);
    var text = writer.ToString();
    Assert.DoesNotContain("\"jsonrpc\"", text);
    Assert.Contains("[MCP] Deprecated feature used:", text);
  }

  [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
  private static partial Regex IsoDateRegex();
}
