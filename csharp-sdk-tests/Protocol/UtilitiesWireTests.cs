using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape tests for the Utilities types (spec §15): the <see cref="ProgressToken"/>
/// string/number rule, progress and cancellation notification params, the eight syslog
/// <see cref="LoggingLevel"/> values, and the logging-message notification params. These assert the
/// REAL serialization behavior of <see cref="McpJson"/> (camelCase names, <c>null</c> members
/// omitted, integral numbers written without a decimal point).
/// </summary>
public sealed class UtilitiesWireTests
{
  // ── ProgressToken: string vs number preservation ──

  [Theory]
  [InlineData("abc-123")]
  [InlineData("")]
  [InlineData("0")]
  [InlineData("file://x")]
  public void Progress_token_string_round_trips_as_a_json_string(string value)
  {
    ProgressToken token = value;
    var json = McpJson.Serialize(token);
    Assert.Equal($"\"{value}\"", json);

    var back = McpJson.Deserialize<ProgressToken>(json);
    Assert.True(back.IsString);
    Assert.False(back.IsNumber);
    Assert.Equal(value, back.ToString());
  }

  [Theory]
  [InlineData(0L)]
  [InlineData(7L)]
  [InlineData(-1L)]
  [InlineData(42L)]
  [InlineData(9007199254740993L)]
  public void Progress_token_integer_round_trips_as_a_bare_integral_number(long value)
  {
    ProgressToken token = value;
    var json = McpJson.Serialize(token);
    Assert.Equal(value.ToString(System.Globalization.CultureInfo.InvariantCulture), json);
    Assert.DoesNotContain(".", json);

    var back = McpJson.Deserialize<ProgressToken>(json);
    Assert.True(back.IsNumber);
    Assert.False(back.IsString);
  }

  [Theory]
  [InlineData(0.5)]
  [InlineData(1.25)]
  [InlineData(-3.5)]
  public void Progress_token_non_integral_number_keeps_its_fraction(double value)
  {
    var token = new ProgressToken(value);
    var json = McpJson.Serialize(token);
    Assert.Contains(".", json);

    var back = McpJson.Deserialize<ProgressToken>(json);
    Assert.True(back.IsNumber);
  }

  [Theory]
  [InlineData(7L, "7")]
  [InlineData(0L, "0")]
  [InlineData(-12L, "-12")]
  public void Progress_token_integral_to_string_has_no_decimal_point(long value, string expected)
  {
    Assert.Equal(expected, new ProgressToken(value).ToString());
  }

  [Theory]
  [InlineData("tok")]
  [InlineData("123")]
  public void Progress_token_string_to_string_returns_the_string(string value)
  {
    Assert.Equal(value, new ProgressToken(value).ToString());
  }

  [Fact]
  public void Progress_token_default_to_string_is_empty()
  {
    Assert.Equal(string.Empty, default(ProgressToken).ToString());
  }

  [Fact]
  public void Progress_token_string_and_number_with_same_text_are_not_equal()
  {
    ProgressToken asString = "7";
    ProgressToken asNumber = 7L;
    Assert.NotEqual(asString, asNumber);
  }

  // ── ProgressToken.ToJsonNode / FromJsonNode ──

  [Fact]
  public void Progress_token_to_json_node_writes_an_integral_long()
  {
    var node = new ProgressToken(7L).ToJsonNode();
    Assert.Equal(JsonValueKind.Number, node.GetValueKind());
    Assert.Equal(7L, node.GetValue<long>());
  }

  [Fact]
  public void Progress_token_to_json_node_writes_a_string()
  {
    var node = new ProgressToken("abc").ToJsonNode();
    Assert.Equal(JsonValueKind.String, node.GetValueKind());
    Assert.Equal("abc", node.GetValue<string>());
  }

  [Fact]
  public void Progress_token_default_to_json_node_throws()
  {
    Assert.Throws<InvalidOperationException>(() => default(ProgressToken).ToJsonNode());
  }

  [Theory]
  [InlineData("7")]
  [InlineData("0")]
  [InlineData("-3")]
  public void Progress_token_from_json_node_reads_an_integral_number(string raw)
  {
    var token = ProgressToken.FromJsonNode(JsonNode.Parse(raw)!);
    Assert.True(token.IsNumber);
  }

  [Theory]
  [InlineData("\"abc\"")]
  [InlineData("\"\"")]
  public void Progress_token_from_json_node_reads_a_string(string raw)
  {
    var token = ProgressToken.FromJsonNode(JsonNode.Parse(raw)!);
    Assert.True(token.IsString);
  }

  [Fact]
  public void Progress_token_from_json_node_reads_a_fractional_number()
  {
    var token = ProgressToken.FromJsonNode(JsonNode.Parse("0.5")!);
    Assert.True(token.IsNumber);
  }

  [Theory]
  [InlineData("true")]
  [InlineData("false")]
  [InlineData("[]")]
  [InlineData("[1,2]")]
  [InlineData("{}")]
  public void Progress_token_from_json_node_rejects_non_string_non_number(string raw)
  {
    var node = JsonNode.Parse(raw)!;
    Assert.Throws<McpError>(() => ProgressToken.FromJsonNode(node));
  }

  // ── ProgressNotificationParams ──

  [Fact]
  public void Progress_notification_method_constant_is_namespaced()
  {
    Assert.Equal("notifications/progress", ProgressNotificationParams.Method);
    Assert.Equal(ProgressNotificationParams.Method, McpMethods.NotificationsProgress);
  }

  [Fact]
  public void Progress_notification_serializes_required_token_and_progress()
  {
    var json = McpJson.Serialize(new ProgressNotificationParams { ProgressToken = 7L, Progress = 0.5 });
    Assert.Contains("\"progressToken\":7", json);
    Assert.Contains("\"progress\":0.5", json);
  }

  [Fact]
  public void Progress_notification_omits_absent_total_and_message()
  {
    var json = McpJson.Serialize(new ProgressNotificationParams { ProgressToken = "p", Progress = 1 });
    Assert.DoesNotContain("\"total\"", json);
    Assert.DoesNotContain("\"message\"", json);
    Assert.DoesNotContain("\"_meta\"", json);
  }

  [Fact]
  public void Progress_notification_emits_total_and_message_when_present()
  {
    var json = McpJson.Serialize(new ProgressNotificationParams
    {
      ProgressToken = "p",
      Progress = 3,
      Total = 10,
      Message = "halfway",
    });
    Assert.Contains("\"total\":10", json);
    Assert.Contains("\"message\":\"halfway\"", json);
  }

  [Theory]
  [InlineData(0.0)]
  [InlineData(0.25)]
  [InlineData(1.0)]
  [InlineData(100.0)]
  public void Progress_notification_round_trips_progress_value(double progress)
  {
    var json = McpJson.Serialize(new ProgressNotificationParams { ProgressToken = "p", Progress = progress });
    var back = McpJson.Deserialize<ProgressNotificationParams>(json)!;
    Assert.Equal(progress, back.Progress);
  }

  [Fact]
  public void Progress_notification_round_trips_string_token()
  {
    var json = McpJson.Serialize(new ProgressNotificationParams { ProgressToken = "abc-123", Progress = 1 });
    var back = McpJson.Deserialize<ProgressNotificationParams>(json)!;
    Assert.True(back.ProgressToken.IsString);
    Assert.Equal("abc-123", back.ProgressToken.ToString());
  }

  [Fact]
  public void Progress_notification_carries_meta_when_set()
  {
    var json = McpJson.Serialize(new ProgressNotificationParams
    {
      ProgressToken = 1L,
      Progress = 1,
      Meta = new JsonObject { ["x"] = "y" },
    });
    Assert.Contains("\"_meta\":{\"x\":\"y\"}", json);
  }

  // ── CancelledNotificationParams ──

  [Fact]
  public void Cancelled_notification_method_constant_is_namespaced()
  {
    Assert.Equal("notifications/cancelled", CancelledNotificationParams.Method);
    Assert.Equal(CancelledNotificationParams.Method, McpMethods.NotificationsCancelled);
  }

  [Fact]
  public void Cancelled_notification_serializes_numeric_request_id()
  {
    var json = McpJson.Serialize(new CancelledNotificationParams { RequestId = 42L });
    Assert.Contains("\"requestId\":42", json);
  }

  [Fact]
  public void Cancelled_notification_serializes_string_request_id()
  {
    var json = McpJson.Serialize(new CancelledNotificationParams { RequestId = "req-9" });
    Assert.Contains("\"requestId\":\"req-9\"", json);
  }

  [Fact]
  public void Cancelled_notification_omits_absent_reason()
  {
    var json = McpJson.Serialize(new CancelledNotificationParams { RequestId = 1L });
    Assert.DoesNotContain("\"reason\"", json);
  }

  [Fact]
  public void Cancelled_notification_emits_reason_when_present()
  {
    var json = McpJson.Serialize(new CancelledNotificationParams { RequestId = 1L, Reason = "user aborted" });
    Assert.Contains("\"reason\":\"user aborted\"", json);
  }

  [Fact]
  public void Cancelled_notification_round_trips_request_id()
  {
    var json = McpJson.Serialize(new CancelledNotificationParams { RequestId = "r-1", Reason = "stop" });
    var back = McpJson.Deserialize<CancelledNotificationParams>(json)!;
    Assert.Equal(new RequestId("r-1"), back.RequestId!.Value);
    Assert.Equal("stop", back.Reason);
  }

  [Fact]
  public void Cancelled_notification_omits_absent_request_id()
  {
    // R-15.2.2-f: a malformed cancellation that omits requestId must round-trip; the null member is
    // omitted on the wire (WhenWritingNull) rather than emitted as null.
    var json = McpJson.Serialize(new CancelledNotificationParams { Reason = "gone" });
    Assert.DoesNotContain("\"requestId\"", json);
    Assert.Contains("\"reason\":\"gone\"", json);
  }

  [Fact]
  public void Cancelled_notification_tolerates_missing_request_id_on_read()
  {
    // A cancellation notification with no requestId is tolerated (R-15.2.2-f): it deserializes with a
    // null RequestId rather than throwing.
    var back = McpJson.Deserialize<CancelledNotificationParams>("{\"reason\":\"gone\"}")!;
    Assert.Null(back.RequestId);
    Assert.Equal("gone", back.Reason);
  }

  // ── LoggingLevel: all eight syslog values ──

  [Theory]
  [InlineData(LoggingLevel.Debug, "debug")]
  [InlineData(LoggingLevel.Info, "info")]
  [InlineData(LoggingLevel.Notice, "notice")]
  [InlineData(LoggingLevel.Warning, "warning")]
  [InlineData(LoggingLevel.Error, "error")]
  [InlineData(LoggingLevel.Critical, "critical")]
  [InlineData(LoggingLevel.Alert, "alert")]
  [InlineData(LoggingLevel.Emergency, "emergency")]
  public void Logging_level_uses_lowercase_syslog_wire_value(LoggingLevel level, string wire)
  {
    var json = McpJson.Serialize(level);
    Assert.Equal($"\"{wire}\"", json);
  }

  [Theory]
  [InlineData("\"debug\"", LoggingLevel.Debug)]
  [InlineData("\"info\"", LoggingLevel.Info)]
  [InlineData("\"notice\"", LoggingLevel.Notice)]
  [InlineData("\"warning\"", LoggingLevel.Warning)]
  [InlineData("\"error\"", LoggingLevel.Error)]
  [InlineData("\"critical\"", LoggingLevel.Critical)]
  [InlineData("\"alert\"", LoggingLevel.Alert)]
  [InlineData("\"emergency\"", LoggingLevel.Emergency)]
  public void Logging_level_deserializes_from_lowercase_wire_value(string raw, LoggingLevel expected)
  {
    Assert.Equal(expected, McpJson.Deserialize<LoggingLevel>(raw));
  }

  [Fact]
  public void Logging_levels_are_ordered_least_to_most_severe()
  {
    Assert.True((int)LoggingLevel.Debug < (int)LoggingLevel.Info);
    Assert.True((int)LoggingLevel.Info < (int)LoggingLevel.Warning);
    Assert.True((int)LoggingLevel.Warning < (int)LoggingLevel.Emergency);
  }

  // ── LoggingMessageNotificationParams ──

  [Fact]
  public void Logging_message_method_constant_is_namespaced()
  {
    Assert.Equal("notifications/message", LoggingMessageNotificationParams.Method);
    Assert.Equal(LoggingMessageNotificationParams.Method, McpMethods.NotificationsMessage);
  }

  [Fact]
  public void Logging_message_serializes_level_and_data()
  {
    var json = McpJson.Serialize(new LoggingMessageNotificationParams
    {
      Level = LoggingLevel.Warning,
      Data = JsonValue.Create("disk full"),
    });
    Assert.Contains("\"level\":\"warning\"", json);
    Assert.Contains("\"data\":\"disk full\"", json);
  }

  [Fact]
  public void Logging_message_omits_absent_logger()
  {
    var json = McpJson.Serialize(new LoggingMessageNotificationParams
    {
      Level = LoggingLevel.Info,
      Data = JsonValue.Create(1),
    });
    Assert.DoesNotContain("\"logger\"", json);
  }

  [Fact]
  public void Logging_message_emits_logger_when_present()
  {
    var json = McpJson.Serialize(new LoggingMessageNotificationParams
    {
      Level = LoggingLevel.Error,
      Logger = "db.pool",
      Data = JsonValue.Create("boom"),
    });
    Assert.Contains("\"logger\":\"db.pool\"", json);
  }

  [Fact]
  public void Logging_message_data_can_be_a_structured_object()
  {
    var json = McpJson.Serialize(new LoggingMessageNotificationParams
    {
      Level = LoggingLevel.Notice,
      Data = new JsonObject { ["code"] = 503, ["msg"] = "unavailable" },
    });
    Assert.Contains("\"data\":{\"code\":503,\"msg\":\"unavailable\"}", json);
  }

  [Fact]
  public void Logging_message_round_trips_level_and_logger()
  {
    var json = McpJson.Serialize(new LoggingMessageNotificationParams
    {
      Level = LoggingLevel.Critical,
      Logger = "core",
      Data = JsonValue.Create(true),
    });
    var back = McpJson.Deserialize<LoggingMessageNotificationParams>(json)!;
    Assert.Equal(LoggingLevel.Critical, back.Level);
    Assert.Equal("core", back.Logger);
    Assert.True(back.Data.GetValue<bool>());
  }
}
