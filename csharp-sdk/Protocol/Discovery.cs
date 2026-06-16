using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The result of the <c>server/discover</c> request (spec §5.3.2): the protocol revisions the
/// server supports, its advertised capabilities, its identity, optional natural-language
/// instructions, and optional result-level metadata. It is a <c>Result</c>, so on the wire it also
/// carries the base <c>resultType</c> discriminator (normally <c>complete</c>); that is added by the
/// runtime.
/// </summary>
public sealed record DiscoverResult
{
  /// <summary>REQUIRED. A non-empty list of protocol revisions the server accepts (§5.3.2, R-5.3.2-b).</summary>
  public required IReadOnlyList<string> SupportedVersions { get; init; }

  /// <summary>REQUIRED. The server's advertised capabilities (§6.3). Empty is valid.</summary>
  public required ServerCapabilities Capabilities { get; init; }

  /// <summary>REQUIRED. The server software identity (§14.3).</summary>
  public required Implementation ServerInfo { get; init; }

  /// <summary>
  /// OPTIONAL. Natural-language guidance describing the server and how to use it effectively,
  /// suitable for a host's model context (§5.3.2). Absent means no guidance.
  /// </summary>
  public string? Instructions { get; init; }

  /// <summary>
  /// OPTIONAL. Result-level metadata envelope (§5.3.2, R-5.3.2-k). Carries arbitrary
  /// protocol-defined or vendor <c>_meta</c> keys; absent when the server attaches none. Serialized
  /// under the wire key <c>_meta</c>.
  /// </summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }

  /// <summary>
  /// Validates that this result is structurally well-formed per §5.3.2 — in particular that
  /// <see cref="SupportedVersions"/> is non-empty (R-5.3.2-b). A server MUST advertise at least one
  /// accepted revision; an empty list is rejected, mirroring the TypeScript <c>superRefine</c> in
  /// <c>DiscoverResultSchema</c> and the <c>buildDiscoverResult</c> <c>RangeError</c> guard.
  /// </summary>
  /// <returns>This same instance, to allow fluent use after construction.</returns>
  /// <exception cref="ArgumentException">When <see cref="SupportedVersions"/> is empty.</exception>
  public DiscoverResult Validated()
  {
    if (SupportedVersions.Count == 0)
    {
      throw new ArgumentException(
        "DiscoverResult.SupportedVersions MUST be a non-empty array (§5.3.2, R-5.3.2-b).",
        nameof(SupportedVersions));
    }
    return this;
  }
}
