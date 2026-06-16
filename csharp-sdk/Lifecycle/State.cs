using System.Text.Json.Serialization;

namespace Stackific.Mcp.Lifecycle;

/// <summary>
/// The three lifecycle states a governed protocol feature can be in (spec §27.1). Every governed
/// feature is in exactly one of these states at any time, and the allowed transitions between them
/// (enforced by <c>Stackific.Mcp.Lifecycle.LifecyclePolicy</c>) encode the deprecation policy of §27.2.
/// </summary>
/// <remarks>
/// Wire values are the lowercase strings <c>active</c>, <c>deprecated</c>, and <c>removed</c>,
/// matching the TypeScript <c>LifecycleState</c> constant object exactly. The legal transitions are:
/// <list type="bullet">
///   <item><description>Active → Deprecated — always permitted (R-27.2).</description></item>
///   <item><description>Deprecated → Active — restoration permitted (R-27.2-n).</description></item>
///   <item><description>Deprecated → Removed — permitted once the window elapses (R-27.2-a).</description></item>
///   <item><description>Active → Removed — FORBIDDEN; a feature MUST pass through Deprecated first (R-27.2-b).</description></item>
///   <item><description>Any transition out of Removed — FORBIDDEN; Removed is terminal (R-27.2).</description></item>
/// </list>
/// </remarks>
[JsonConverter(typeof(JsonStringEnumConverter<LifecycleState>))]
public enum LifecycleState
{
  /// <summary>Fully supported and recommended; implemented exactly as specified (R-27.1-a). Wire value <c>active</c>.</summary>
  [JsonStringEnumMemberName("active")]
  Active,

  /// <summary>
  /// Still defined and functional, but discouraged for new use and scheduled for eventual removal;
  /// carries a migration note (R-27.1-b). Wire value <c>deprecated</c>.
  /// </summary>
  [JsonStringEnumMemberName("deprecated")]
  Deprecated,

  /// <summary>
  /// Not defined by the document; carries no meaning and imposes no obligation. A Removed feature is
  /// simply absent from the spec text and registries (R-27.1). Wire value <c>removed</c>.
  /// </summary>
  [JsonStringEnumMemberName("removed")]
  Removed,
}

/// <summary>
/// Per-feature lifecycle bookkeeping (spec §27.1, §27.2). This is a conceptual governance record,
/// not a wire type — it captures where a feature sits in its lifecycle and the metadata the policy
/// rules consume (deprecation date, earliest-removal revision, migration note, expedited flag).
/// </summary>
/// <remarks>
/// Mirrors the TypeScript <c>LifecycleRecord</c> interface. <see cref="DeprecatedSince"/> and
/// <see cref="Migration"/> are present only when the feature is <see cref="LifecycleState.Deprecated"/>;
/// <see cref="Migration"/> is REQUIRED when Deprecated (R-27.2-g) and may be the literal
/// <c>"none required"</c>.
/// </remarks>
public sealed record LifecycleRecord
{
  /// <summary>Identifier of the governed feature (a method, capability, type, etc.).</summary>
  public required string Feature { get; init; }

  /// <summary>The feature's current lifecycle state.</summary>
  public required LifecycleState State { get; init; }

  /// <summary>
  /// ISO-8601 (<c>YYYY-MM-DD</c>) date on which the feature first became Deprecated. Present only when
  /// <see cref="State"/> is <see cref="LifecycleState.Deprecated"/>.
  /// </summary>
  public string? DeprecatedSince { get; init; }

  /// <summary>
  /// The protocol revision on or after which the feature becomes eligible for removal (R-27.2-c).
  /// </summary>
  public string? EarliestRemoval { get; init; }

  /// <summary>
  /// The documented migration path, or <c>"none required"</c>. REQUIRED when the feature is
  /// Deprecated (R-27.2-g).
  /// </summary>
  public string? Migration { get; init; }

  /// <summary>
  /// Whether a security-driven, shortened deprecation window applies (a minimum of 90 days rather than
  /// the standard 12 months) (R-27.2-k, R-27.2-l). Defaults to <c>false</c>.
  /// </summary>
  public bool Expedited { get; init; }
}

/// <summary>
/// One row of the derived registry of deprecated features (spec §27.3). The registry is a
/// consolidated, derived view; the per-feature notices at the authoritative defining sections
/// resolve any conflict.
/// </summary>
/// <remarks>Mirrors the TypeScript <c>DeprecatedRegistryEntry</c> interface.</remarks>
public sealed record DeprecatedRegistryEntry
{
  /// <summary>The name of the deprecated feature, exactly as registered.</summary>
  public required string Feature { get; init; }

  /// <summary>The section reference where the feature is authoritatively defined (for example <c>§21</c>).</summary>
  public required string DefinedIn { get; init; }

  /// <summary>One-line migration guidance for moving off the feature (R-27.2-g).</summary>
  public required string MigrationNote { get; init; }

  /// <summary>The protocol revision (<c>YYYY-MM-DD</c>) on or after which removal is eligible.</summary>
  public required string EarliestRemoval { get; init; }
}
