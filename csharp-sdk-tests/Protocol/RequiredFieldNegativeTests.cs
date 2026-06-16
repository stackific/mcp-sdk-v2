using System.Text.Json;

using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Negative coverage for REQUIRED fields that are correct only "by construction" — they are enforced by
/// C# <c>required</c> members and the case-sensitive <c>System.Text.Json</c> binder rather than by an
/// explicit guard. Without these tests a future change to the serializer options (e.g. relaxing
/// required-member handling) could silently let a malformed wire object through. Each test asserts that
/// deserializing a body that OMITS a required field throws — locking the MUST in place. (S01/S20 §14.3,
/// §14.2; S22 §15.1.3; S23 §15.3.2)
/// </summary>
public sealed class RequiredFieldNegativeTests
{
  // ── Implementation (§14.3): name + version REQUIRED ──
  [Fact]
  public void Implementation_missing_name_is_rejected() =>
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<Implementation>("""{"version":"1.0.0"}"""));

  [Fact]
  public void Implementation_missing_version_is_rejected() =>
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<Implementation>("""{"name":"srv"}"""));

  // ── Icon (§14.2): src REQUIRED ──
  [Fact]
  public void Icon_missing_src_is_rejected() =>
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<Icon>("""{"mimeType":"image/png"}"""));

  // ── ProgressNotificationParams (§15.1.3): progressToken + progress REQUIRED ──
  [Fact]
  public void Progress_params_missing_token_is_rejected() =>
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<ProgressNotificationParams>("""{"progress":1}"""));

  [Fact]
  public void Progress_params_missing_progress_is_rejected() =>
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<ProgressNotificationParams>("""{"progressToken":"p"}"""));

  // ── LoggingMessageNotificationParams (§15.3.2): level + data REQUIRED ──
  [Fact]
  public void Logging_params_missing_level_is_rejected() =>
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<LoggingMessageNotificationParams>("""{"data":"oops"}"""));

  [Fact]
  public void Logging_params_missing_data_is_rejected() =>
    Assert.ThrowsAny<JsonException>(() => McpJson.Deserialize<LoggingMessageNotificationParams>("""{"level":"info"}"""));
}
