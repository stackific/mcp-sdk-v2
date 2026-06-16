using Stackific.Mcp;
using Stackific.Mcp.Lifecycle;

namespace Stackific.Mcp.Tests.Lifecycle;

/// <summary>
/// Coverage for the feature-lifecycle state enumeration and its transition legality (spec §27.1),
/// mirroring the TypeScript <c>lifecycle/state.test.ts</c> scenarios (AC-43.1–AC-43.6). The three
/// states are Active, Deprecated, and Removed; Removed is terminal and Active → Removed is forbidden.
/// </summary>
public sealed class StateTests
{
  // ----- Three states with exact wire values (AC-43.1) -----

  [Theory]
  [InlineData(LifecycleState.Active, "active")]
  [InlineData(LifecycleState.Deprecated, "deprecated")]
  [InlineData(LifecycleState.Removed, "removed")]
  public void LifecycleState_serializes_to_the_lowercase_wire_value(LifecycleState state, string expected)
  {
    Assert.Equal($"\"{expected}\"", McpJson.Serialize(state));
  }

  [Fact]
  public void LifecycleState_has_exactly_three_values()
  {
    Assert.Equal(3, Enum.GetValues<LifecycleState>().Length);
  }

  [Theory]
  [InlineData("\"active\"", LifecycleState.Active)]
  [InlineData("\"deprecated\"", LifecycleState.Deprecated)]
  [InlineData("\"removed\"", LifecycleState.Removed)]
  public void LifecycleState_deserializes_from_the_wire_value(string json, LifecycleState expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<LifecycleState>(json));
  }

  // ----- Valid transitions (AC-43.2) -----

  [Fact]
  public void Active_to_Deprecated_is_valid()
  {
    Assert.True(LifecyclePolicy.CanTransition(LifecycleState.Active, LifecycleState.Deprecated));
  }

  [Fact]
  public void Deprecated_to_Removed_is_valid()
  {
    Assert.True(LifecyclePolicy.CanTransition(LifecycleState.Deprecated, LifecycleState.Removed));
  }

  [Fact]
  public void Deprecated_to_Active_restoration_is_valid()
  {
    Assert.True(LifecyclePolicy.CanTransition(LifecycleState.Deprecated, LifecycleState.Active));
  }

  // ----- Active → Removed is forbidden (AC-43.3) -----

  [Fact]
  public void Active_to_Removed_is_forbidden()
  {
    Assert.False(LifecyclePolicy.CanTransition(LifecycleState.Active, LifecycleState.Removed));
    Assert.Throws<InvalidOperationException>(() =>
      LifecyclePolicy.AssertValidTransition(LifecycleState.Active, LifecycleState.Removed));
  }

  // ----- Removed is terminal (AC-43.4) -----

  [Theory]
  [InlineData(LifecycleState.Active)]
  [InlineData(LifecycleState.Deprecated)]
  [InlineData(LifecycleState.Removed)]
  public void Removed_has_no_outgoing_transition(LifecycleState target)
  {
    Assert.False(LifecyclePolicy.CanTransition(LifecycleState.Removed, target));
  }

  // ----- Same-state is not a transition (AC-43.5) -----

  [Theory]
  [InlineData(LifecycleState.Active)]
  [InlineData(LifecycleState.Deprecated)]
  [InlineData(LifecycleState.Removed)]
  public void Same_state_is_not_a_valid_transition(LifecycleState state)
  {
    Assert.False(LifecyclePolicy.CanTransition(state, state));
  }

  // ----- LifecycleRecord captures metadata (AC-43.6) -----

  [Fact]
  public void LifecycleRecord_captures_deprecation_metadata()
  {
    var record = new LifecycleRecord
    {
      Feature = "Sampling capability",
      State = LifecycleState.Deprecated,
      DeprecatedSince = "2025-07-28",
      EarliestRemoval = "2026-07-28",
      Migration = "Use Elicitation instead.",
      Expedited = false,
    };

    Assert.Equal("Sampling capability", record.Feature);
    Assert.Equal(LifecycleState.Deprecated, record.State);
    Assert.Equal("2025-07-28", record.DeprecatedSince);
    Assert.Equal("2026-07-28", record.EarliestRemoval);
    Assert.Equal("Use Elicitation instead.", record.Migration);
    Assert.False(record.Expedited);
  }

  [Fact]
  public void LifecycleRecord_defaults_optional_metadata_to_null_or_false()
  {
    var record = new LifecycleRecord { Feature = "X", State = LifecycleState.Active };

    Assert.Null(record.DeprecatedSince);
    Assert.Null(record.EarliestRemoval);
    Assert.Null(record.Migration);
    Assert.False(record.Expedited);
  }

  [Fact]
  public void DeprecatedRegistryEntry_holds_all_required_fields()
  {
    var entry = new DeprecatedRegistryEntry
    {
      Feature = "Roots capability",
      DefinedIn = "§21",
      MigrationNote = "No direct replacement.",
      EarliestRemoval = "2026-07-28",
    };

    Assert.Equal("Roots capability", entry.Feature);
    Assert.Equal("§21", entry.DefinedIn);
    Assert.Equal("No direct replacement.", entry.MigrationNote);
    Assert.Equal("2026-07-28", entry.EarliestRemoval);
  }
}
