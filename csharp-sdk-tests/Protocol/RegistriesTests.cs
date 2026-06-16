using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

using Xunit;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Coverage for S46 — Consolidated Registries (Appendices A–E), as ported into <see cref="Registries"/>.
/// Mirrors the TypeScript <c>registries.test.ts</c> scenarios: the Appendix A method index (with the
/// added <c>ui/initialize</c>/<c>ui/notifications/initialized</c> handshake names and the UI-dialect
/// index), the Appendix B custom-error-code collision validators and reserved range, the Appendix C
/// reserved-key registry + permit logic, the Appendix D capability registry + UI value validators, and
/// the 176-row Appendix E type index.
/// </summary>
public sealed class RegistriesTests
{
  // ─── Appendix A — Method and Notification Index ─────────────────────────────────

  [Fact]
  public void MethodRegistry_Has28EntriesWithMetadata()
  {
    Assert.Equal(28, Registries.MethodRegistry.Count);
    foreach (var entry in Registries.MethodRegistry)
    {
      Assert.False(string.IsNullOrEmpty(entry.Name));
      Assert.False(string.IsNullOrEmpty(entry.Direction));
      Assert.StartsWith("§", entry.DefinedIn);
    }
  }

  [Theory]
  [InlineData("elicitation/create")]
  [InlineData("sampling/createMessage")]
  [InlineData("roots/list")]
  public void InputRequestKinds_AreClassifiedAndDeliveredViaSection11(string name)
  {
    var entry = Registries.LookupMethod(name);
    Assert.NotNull(entry);
    Assert.Equal(Registries.RegistryMethodKind.InputRequest, entry!.Kind);
    Assert.Contains("input-required result", entry.Direction);
  }

  [Fact]
  public void CoreRequestsAndNotifications_RecordTheirDirection()
  {
    Assert.Equal(Registries.RegistryMethodKind.Request, Registries.LookupMethod("tools/list")!.Kind);
    Assert.Equal("client→server", Registries.LookupMethod("tools/list")!.Direction);
    Assert.Equal(Registries.RegistryMethodKind.Notification, Registries.LookupMethod("notifications/message")!.Kind);
    Assert.Equal("server→client", Registries.LookupMethod("notifications/message")!.Direction);
    Assert.Equal("client→server or server→client", Registries.LookupMethod("notifications/progress")!.Direction);
  }

  [Fact]
  public void UiDialectNames_AreScopedToTheActiveUiExtension()
  {
    Assert.False(Registries.IsRegisteredMethod("ui/open-link"));
    Assert.Null(Registries.LookupMethod("ui/open-link"));
    var uiEntry = Registries.LookupMethod("ui/open-link", includeUiDialect: true);
    Assert.NotNull(uiEntry);
    Assert.True(uiEntry!.ExtensionScoped);

    // The two handshake names are in the core index but marked extension-scoped.
    Assert.True(Registries.LookupMethod("ui/initialize")!.ExtensionScoped);
    Assert.True(Registries.LookupMethod("ui/notifications/initialized")!.ExtensionScoped);
    Assert.All(Registries.UiDialectMethodIndex, e => Assert.True(e.ExtensionScoped));
  }

  [Fact]
  public void LookupMethod_ReturnsNullForUnknown()
  {
    Assert.Null(Registries.LookupMethod("does/not-exist"));
    Assert.False(Registries.IsRegisteredMethod("does/not-exist"));
  }

  // ─── Appendix B — Error Code Registry ───────────────────────────────────────────

  [Theory]
  [InlineData(-32700)]
  [InlineData(-32600)]
  [InlineData(-32601)]
  [InlineData(-32602)]
  [InlineData(-32603)]
  [InlineData(-32003)]
  [InlineData(-32004)]
  [InlineData(-32001)]
  public void ReExportsTheRegistry_AndCustomCollisionIsRejected(int code)
  {
    Assert.True(Registries.ErrorCodeRegistry.ContainsKey(code));
    Assert.True(Registries.IsErrorCodeDefinedByDocument(code));
    var result = Registries.ValidateCustomErrorCode(code);
    Assert.False(result.Ok);
    Assert.Equal(Registries.CustomErrorCodeRejection.CollidesWithReserved, result.Reason);
  }

  [Fact]
  public void Appendix_B_RangeAndCustomCodeFlags()
  {
    Assert.Equal(-32099, Registries.ServerErrorRange.Min);
    Assert.Equal(-32000, Registries.ServerErrorRange.Max);

    // -32001 (HeaderMismatch) collides.
    Assert.False(Registries.ValidateCustomErrorCode(-32001).Ok);
    // The legacy -32002 resource-not-found literal is caught by the full registry.
    Assert.True(Registries.IsErrorCodeDefinedByDocument(-32002));

    // A free value inside the range is accepted and flagged in-range.
    var inRange = Registries.ValidateCustomErrorCode(-32050);
    Assert.True(inRange.Ok);
    Assert.True(inRange.InReservedRange);

    // A free value outside the range is accepted and flagged out-of-range.
    var outOfRange = Registries.ValidateCustomErrorCode(-31000);
    Assert.True(outOfRange.Ok);
    Assert.False(outOfRange.InReservedRange);

    // Non-integers are rejected (delegated to the §22 helper).
    Assert.False(Registries.ValidateCustomErrorCode(-32000.5).Ok);
    Assert.False(Registries.ValidateExtensionErrorCode(-32000.5).Ok);
  }

  [Fact]
  public void ReservedCodeSet_MatchesTheReservedListAndIncludes32001()
  {
    Assert.Equal(Registries.ReservedErrorCodes.Count, Registries.AppendixBReservedCodeSet.Count);
    Assert.Contains(ErrorCodes.HeaderMismatch, Registries.AppendixBReservedCodeSet);
  }

  // ─── Appendix C — Reserved _meta Key Registry ───────────────────────────────────

  [Fact]
  public void MetaKeyRegistry_EnumeratesEveryReservedKey()
  {
    foreach (var entry in Registries.MetaKeyRegistry)
    {
      Assert.False(string.IsNullOrEmpty(entry.Key));
      Assert.False(string.IsNullOrEmpty(entry.UsedOn));
      Assert.False(string.IsNullOrEmpty(entry.Meaning));
      Assert.StartsWith("§", entry.DefinedIn);
    }
  }

  [Theory]
  [InlineData("io.modelcontextprotocol/protocolVersion")]
  [InlineData("io.modelcontextprotocol/clientInfo")]
  [InlineData("io.modelcontextprotocol/clientCapabilities")]
  [InlineData("io.modelcontextprotocol/logLevel")]
  [InlineData("io.modelcontextprotocol/subscriptionId")]
  [InlineData("io.modelcontextprotocol/tasks")]
  [InlineData("io.modelcontextprotocol/ui")]
  [InlineData("progressToken")]
  [InlineData("traceparent")]
  [InlineData("tracestate")]
  [InlineData("baggage")]
  public void ReservedKeys_ArePermitted(string key)
  {
    Assert.True(Registries.IsReservedMetaKey(key));
    Assert.True(Registries.IsMetaKeyPermitted(key));
  }

  [Fact]
  public void PrefixReservation_AndCustomBareKeyHandling()
  {
    Assert.True(Registries.IsReservedMetaKey("io.modelcontextprotocol/somethingNew"));
    // A bare custom key is neither reserved nor permitted.
    Assert.False(Registries.IsReservedMetaKey("customBareKey"));
    Assert.False(Registries.IsMetaKeyPermitted("customBareKey"));
    // An extension-defined, validly-prefixed key is permitted but not reserved by the document.
    Assert.False(Registries.IsReservedMetaKey("com.example.acme/customKey"));
    Assert.True(Registries.IsMetaKeyPermitted("com.example.acme/customKey"));
    Assert.Null(Registries.LookupMetaKey("com.example.acme/customKey"));
  }

  [Fact]
  public void RequiredClientRequestMetaKeys_AreTheThreeBaselineFields()
  {
    Assert.Equal(
      ["io.modelcontextprotocol/protocolVersion", "io.modelcontextprotocol/clientInfo", "io.modelcontextprotocol/clientCapabilities"],
      Registries.RequiredClientRequestMetaKeys());
    foreach (var key in Registries.RequiredClientRequestMetaKeys())
    {
      var entry = Registries.LookupMetaKey(key);
      Assert.True(entry!.Required);
      Assert.StartsWith("every client request", entry.UsedOn);
    }
  }

  [Fact]
  public void LogLevel_IsOptionalAndDeprecated()
  {
    var entry = Registries.LookupMetaKey("io.modelcontextprotocol/logLevel");
    Assert.False(entry!.Required);
    Assert.True(entry.Deprecated);
  }

  [Fact]
  public void ProgressToken_And_TraceContext_Metadata()
  {
    var progress = Registries.LookupMetaKey("progressToken");
    Assert.False(progress!.Required);
    Assert.Contains("notifications/progress", progress.Meaning);
    Assert.Contains("string or number", progress.Meaning);

    foreach (var key in new[] { "traceparent", "tracestate", "baggage" })
    {
      var entry = Registries.LookupMetaKey(key);
      Assert.False(entry!.Required);
      Assert.Contains("request and notification", entry.UsedOn);
    }
  }

  // ─── Appendix C/D — UI host value and tool _meta.ui ─────────────────────────────

  [Fact]
  public void ValidateUiHostValue()
  {
    Assert.Equal("text/html;profile=mcp-app", Registries.UiHostRequiredMimeType);
    Assert.True(Registries.ValidateUiHostValue(new JsonObject { ["mimeTypes"] = new JsonArray("text/html;profile=mcp-app") }).Ok);

    Assert.Equal(Registries.UiHostValueFailure.MissingMimeTypes, Registries.ValidateUiHostValue(new JsonObject()).Reason);
    Assert.Equal(Registries.UiHostValueFailure.MissingRequiredMimeType,
      Registries.ValidateUiHostValue(new JsonObject { ["mimeTypes"] = new JsonArray("text/plain") }).Reason);
    Assert.Equal(Registries.UiHostValueFailure.MimeTypesNotArray,
      Registries.ValidateUiHostValue(new JsonObject { ["mimeTypes"] = "text/html;profile=mcp-app" }).Reason);
    Assert.Equal(Registries.UiHostValueFailure.NotAnObject, Registries.ValidateUiHostValue(null).Reason);
  }

  [Fact]
  public void ValidateToolUiMetaValue()
  {
    Assert.True(Registries.ValidateToolUiMetaValue(new JsonObject { ["resourceUri"] = "ui://charts/line", ["visibility"] = "inline" }).Ok);
    Assert.True(Registries.ValidateToolUiMetaValue(new JsonObject { ["resourceUri"] = "ui://charts/line" }).Ok);
    Assert.Equal(Registries.ToolUiMetaFailure.MissingResourceUri,
      Registries.ValidateToolUiMetaValue(new JsonObject { ["visibility"] = "inline" }).Reason);
    Assert.Equal(Registries.ToolUiMetaFailure.ResourceUriNotUiUri,
      Registries.ValidateToolUiMetaValue(new JsonObject { ["resourceUri"] = "https://example.com/x" }).Reason);
    Assert.Equal(Registries.ToolUiMetaFailure.NotAnObject, Registries.ValidateToolUiMetaValue("nope").Reason);

    var uiKey = Registries.LookupMetaKey("ui");
    Assert.True(uiKey!.Required);
    Assert.Contains("user-interface extension is active", uiKey.Meaning);
  }

  // ─── Appendix D — Capability Registry ───────────────────────────────────────────

  [Fact]
  public void CapabilityRegistry_DisambiguatesBySide()
  {
    foreach (var entry in Registries.CapabilityRegistry)
    {
      Assert.False(string.IsNullOrEmpty(entry.Capability));
      Assert.Contains(entry.Side, new[] { "client", "server", "host", "host/server", "client and server" });
      Assert.StartsWith("§", entry.DefinedIn);
    }
    Assert.Equal("client", Registries.LookupCapability("extensions", "client")?.Side);
    Assert.Equal("server", Registries.LookupCapability("extensions", "server")?.Side);
  }

  [Fact]
  public void ElicitationFormFlag_IsOptionalAndMentionsUrlMode()
  {
    var form = Registries.LookupCapabilitySubFlag("elicitation", "form", "client");
    Assert.False(form!.Required);
    Assert.Contains("url mode", form.Gates);
  }

  [Fact]
  public void SamplingFlags_AreOptionalAndDeprecated()
  {
    Assert.True(Registries.LookupCapability("sampling", "client")!.Deprecated);
    var tools = Registries.LookupCapabilitySubFlag("sampling", "tools", "client");
    var context = Registries.LookupCapabilitySubFlag("sampling", "context", "client");
    Assert.False(tools!.Required);
    Assert.Contains("tools/toolChoice", tools.Gates);
    Assert.False(context!.Required);
    Assert.True(context.Deprecated);
    Assert.Contains("includeContext", context.Gates);
  }

  [Fact]
  public void ServerBooleanSubFlags()
  {
    var toolsFlag = Registries.LookupCapabilitySubFlag("tools", "listChanged", "server");
    Assert.False(toolsFlag!.Required);
    Assert.True(toolsFlag.Boolean);

    var listChanged = Registries.LookupCapabilitySubFlag("resources", "listChanged", "server");
    var subscribe = Registries.LookupCapabilitySubFlag("resources", "subscribe", "server");
    Assert.True(listChanged!.Boolean);
    Assert.True(subscribe!.Boolean);

    Assert.True(Registries.LookupCapabilitySubFlag("prompts", "listChanged", "server")!.Boolean);
  }

  [Fact]
  public void DeprecatedAndEmptyCapabilities()
  {
    Assert.True(Registries.LookupCapability("roots", "client")!.Deprecated);
    Assert.Empty(Registries.LookupCapability("roots", "client")!.SubFlags);
    Assert.Empty(Registries.LookupCapability("completions", "server")!.SubFlags);
    Assert.True(Registries.LookupCapability("logging", "server")!.Deprecated);
    Assert.Equal("client and server", Registries.LookupCapability("io.modelcontextprotocol/tasks")!.Side);

    var ui = Registries.LookupCapability("io.modelcontextprotocol/ui");
    Assert.True(ui!.Extension);
    var mimeFlag = Registries.LookupCapabilitySubFlag("io.modelcontextprotocol/ui", "mimeTypes");
    Assert.True(mimeFlag!.Required);
    Assert.Contains("server acknowledgement value MAY be empty", mimeFlag.Gates);
  }

  // ─── Appendix E — Consolidated Type Index ───────────────────────────────────────

  [Fact]
  public void TypeRegistry_HasEntriesWithSectionAndPurpose()
  {
    Assert.True(Registries.TypeRegistry.Count > 100);
    Assert.Equal(176, Registries.TypeRegistry.Count);
    foreach (var entry in Registries.TypeRegistry)
    {
      Assert.False(string.IsNullOrEmpty(entry.Type));
      Assert.StartsWith("§", entry.DefinedIn);
      Assert.False(string.IsNullOrEmpty(entry.Purpose));
    }
  }

  [Fact]
  public void TypeRegistry_IsBroadlyAlphabeticalWithKnownEndpoints()
  {
    var firstLetters = Registries.TypeRegistry.Select(e => char.ToLowerInvariant(e.Type[0])).ToList();
    for (var i = 1; i < firstLetters.Count; i++)
    {
      Assert.True(firstLetters[i] >= firstLetters[i - 1]);
    }
    Assert.Equal("Annotations", Registries.TypeRegistry[0].Type);
    Assert.Equal("WorkingTask", Registries.TypeRegistry[^1].Type);
  }

  [Fact]
  public void TypeRegistry_HasNoDuplicates_AndLooksUp()
  {
    var names = Registries.TypeRegistry.Select(e => e.Type).ToList();
    Assert.Equal(names.Count, names.Distinct().Count());
    Assert.Contains("tools/call", Registries.LookupType("CallToolResult")!.DefinedIn);
    Assert.Null(Registries.LookupType("NotARealType"));
  }
}
