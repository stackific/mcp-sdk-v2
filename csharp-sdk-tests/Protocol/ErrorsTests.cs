using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// The §22 error-code registry, classification taxonomy, extension-code rules, HTTP-status overlay,
/// inbound-failure-stage mapping, canonical resource-not-found mapping, and tool-failure-mechanism
/// classifier. Mirrors the TypeScript <c>errors.test.ts</c> suite (excluding the cross-module
/// version-reselection case, which belongs to negotiation, not this subsystem).
/// </summary>
public sealed class ErrorsTests
{
  // ----- reserved code values (AC-34.25) -----

  [Fact]
  public void The_eight_reserved_codes_have_their_spec_values()
  {
    Assert.Equal(-32700, ErrorCodes.ParseError);
    Assert.Equal(-32600, ErrorCodes.InvalidRequest);
    Assert.Equal(-32601, ErrorCodes.MethodNotFound);
    Assert.Equal(-32602, ErrorCodes.InvalidParams);
    Assert.Equal(-32603, ErrorCodes.InternalError);
    Assert.Equal(-32003, ErrorCodes.MissingRequiredClientCapability);
    Assert.Equal(-32004, ErrorCodes.UnsupportedProtocolVersion);
    Assert.Equal(-32001, ErrorCodes.HeaderMismatch);
  }

  [Fact]
  public void Invalid_cursor_is_an_alias_for_invalid_params()
  {
    Assert.Equal(ErrorCodes.InvalidParams, ErrorRegistry.InvalidCursorCode);
  }

  // ----- AC-34.7 — code is authoritative, message is not -----

  [Fact]
  public void Classification_varies_with_code_never_with_message()
  {
    var a = ErrorRegistry.DescribeUnknownErrorCode(new JsonRpcError(70001, "one"));
    var b = ErrorRegistry.DescribeUnknownErrorCode(new JsonRpcError(70001, "a totally different message"));
    Assert.Equal(a.Class, b.Class);
    Assert.Equal(a.Code, b.Code);
    Assert.Equal(ErrorCodeClass.JsonRpcStandard, ErrorRegistry.ClassifyErrorCode(ErrorCodes.InvalidParams));
  }

  // ----- AC-34.8 — data optional / normative -----

  [Fact]
  public void Negotiation_codes_have_normative_data_with_required_keys()
  {
    var missingCap = ErrorRegistry.Registry[ErrorCodes.MissingRequiredClientCapability];
    Assert.Equal(ErrorDataPolicy.Normative, missingCap.DataPolicy);
    Assert.Equal(["requiredCapabilities"], missingCap.DataKeys!);

    var unsupported = ErrorRegistry.Registry[ErrorCodes.UnsupportedProtocolVersion];
    Assert.Equal(ErrorDataPolicy.Normative, unsupported.DataPolicy);
    Assert.Equal(["supported", "requested"], unsupported.DataKeys!);
  }

  [Fact]
  public void Standard_codes_have_sender_defined_data()
  {
    Assert.Equal(ErrorDataPolicy.SenderDefined, ErrorRegistry.Registry[ErrorCodes.ParseError].DataPolicy);
  }

  // ----- AC-34.9 — standard condition → code -----

  [Fact]
  public void Each_standard_condition_maps_to_the_mandated_code()
  {
    Assert.Equal(-32700, ErrorRegistry.ErrorCodeForInboundFailure(InboundFailureStage.UnparseableJson));
    Assert.Equal(-32600, ErrorRegistry.ErrorCodeForInboundFailure(InboundFailureStage.InvalidRequestObject));
    Assert.Equal(-32602, ErrorRegistry.ErrorCodeForInboundFailure(InboundFailureStage.InvalidMetadata));
  }

  [Fact]
  public void All_five_standard_codes_classify_as_json_rpc_standard()
  {
    foreach (var code in new[] { -32700, -32600, -32601, -32602, -32603 })
    {
      Assert.Equal(ErrorCodeClass.JsonRpcStandard, ErrorRegistry.LookupErrorCode(code)!.Class);
    }
  }

  // ----- AC-34.12 / AC-34.13 — normative data keys -----

  [Fact]
  public void Missing_client_capability_pins_required_capabilities()
  {
    var entry = ErrorRegistry.Registry[ErrorCodes.MissingRequiredClientCapability];
    Assert.Equal("MissingRequiredClientCapability", entry.Name);
    Assert.Contains("requiredCapabilities", entry.DataKeys!);
  }

  [Fact]
  public void Unsupported_protocol_version_pins_supported_and_requested()
  {
    var entry = ErrorRegistry.Registry[ErrorCodes.UnsupportedProtocolVersion];
    Assert.Equal("UnsupportedProtocolVersion", entry.Name);
    Assert.Equal(["supported", "requested"], entry.DataKeys!);
  }

  // ----- AC-34.15 / AC-34.16 — -32602 conditions and resource-not-found -----

  [Fact]
  public void All_canonical_validation_failures_collapse_onto_invalid_params()
  {
    Assert.Equal(-32602, ErrorCodes.InvalidParams);
    Assert.Equal(-32602, ErrorRegistry.InvalidCursorCode);
    Assert.Equal(-32602, ErrorRegistry.BuildResourceNotFoundParamsError("file:///x.txt").Code);
  }

  [Fact]
  public void Resource_not_found_carries_data_uri_and_a_default_message()
  {
    var err = ErrorRegistry.BuildResourceNotFoundParamsError("file:///nonexistent.txt");
    Assert.Equal(-32602, err.Code);
    Assert.Equal("Resource not found", err.Message);
    Assert.Equal("file:///nonexistent.txt", err.Data!["uri"]!.GetValue<string>());
  }

  // ----- AC-34.18 — protocol error vs feature-level error result -----

  [Theory]
  [InlineData(ToolCallFailureSituation.UnknownTool, ToolFailureMechanism.ProtocolError)]
  [InlineData(ToolCallFailureSituation.InvalidArguments, ToolFailureMechanism.ProtocolError)]
  [InlineData(ToolCallFailureSituation.ExecutionFailure, ToolFailureMechanism.ErrorResult)]
  public void Tool_call_failure_classification_is_total_and_never_the_reverse(
    ToolCallFailureSituation situation, ToolFailureMechanism expected) =>
    Assert.Equal(expected, ErrorRegistry.ClassifyToolCallFailure(situation));

  // ----- AC-34.19..22 — transport mapping -----

  [Fact]
  public void Negotiation_and_routing_codes_map_to_http_400()
  {
    Assert.Equal(400, ErrorRegistry.HttpStatusForRegistryCode(ErrorCodes.MissingRequiredClientCapability));
    Assert.Equal(400, ErrorRegistry.HttpStatusForRegistryCode(ErrorCodes.UnsupportedProtocolVersion));
    Assert.Equal(400, ErrorRegistry.HttpStatusForRegistryCode(ErrorCodes.HeaderMismatch));
  }

  [Fact]
  public void Routing_header_failure_maps_to_header_mismatch()
  {
    Assert.Equal(ErrorCodes.HeaderMismatch, ErrorRegistry.ErrorCodeForInboundFailure(InboundFailureStage.RoutingHeader));
  }

  [Fact]
  public void Codes_without_an_http_overlay_return_null()
  {
    Assert.Null(ErrorRegistry.HttpStatusForRegistryCode(ErrorCodes.ParseError));
    Assert.Null(ErrorRegistry.HttpStatusForRegistryCode(ErrorCodes.InvalidParams));
  }

  // ----- AC-34.23 — extension code rules -----

  [Fact]
  public void Reserved_codes_list_is_exactly_the_eight()
  {
    var sorted = ErrorRegistry.ReservedErrorCodes.OrderBy(c => c).ToArray();
    var expected = new[] { -32700, -32603, -32602, -32601, -32600, -32004, -32003, -32001 }
      .OrderBy(c => c).ToArray();
    Assert.Equal(expected, sorted);
  }

  [Theory]
  [InlineData(1000)]
  [InlineData(-31999)]
  public void Extension_code_accepts_non_reserved_integers(int code)
  {
    var result = ErrorRegistry.ValidateExtensionErrorCode(code);
    Assert.True(result.Ok);
    Assert.Null(result.Reason);
  }

  [Fact]
  public void Extension_code_rejects_reserved_collisions()
  {
    foreach (var code in ErrorRegistry.ReservedErrorCodes)
    {
      var result = ErrorRegistry.ValidateExtensionErrorCode(code);
      Assert.False(result.Ok);
      Assert.Equal(ExtensionCodeRejection.CollidesWithReserved, result.Reason);
    }

    Assert.True(ErrorRegistry.IsReservedErrorCode(-32700));
    Assert.False(ErrorRegistry.IsReservedErrorCode(1000));
  }

  [Fact]
  public void Extension_code_rejects_non_integers_via_the_double_overload()
  {
    var result = ErrorRegistry.ValidateExtensionErrorCode(1.5);
    Assert.False(result.Ok);
    Assert.Equal(ExtensionCodeRejection.NotAnInteger, result.Reason);
  }

  // ----- AC-34.24 — unknown codes tolerated, not rejected -----

  [Fact]
  public void Describe_unknown_code_surfaces_it_as_failed_with_message_and_data()
  {
    var descriptor = ErrorRegistry.DescribeUnknownErrorCode(
      new JsonRpcError(424242, "custom", new JsonObject { ["detail"] = 1 }));
    Assert.True(descriptor.Failed);
    Assert.Equal(424242, descriptor.Code);
    Assert.Equal(ErrorCodeClass.ExtensionDefined, descriptor.Class);
    Assert.Equal("custom", descriptor.Message);
    Assert.Equal(1, descriptor.Data!["detail"]!.GetValue<int>());
  }

  [Fact]
  public void Describe_unknown_code_omits_data_when_none_is_present()
  {
    var descriptor = ErrorRegistry.DescribeUnknownErrorCode(new JsonRpcError(424242, "custom"));
    Assert.True(descriptor.Failed);
    Assert.Null(descriptor.Data);
  }

  // ----- AC-34.25 — registry exactness & classification -----

  [Fact]
  public void Every_registry_row_reports_its_own_code_under_its_key_with_a_trimmed_name()
  {
    foreach (var (key, entry) in ErrorRegistry.Registry)
    {
      Assert.Equal(key, entry.Code);
      Assert.Equal(entry.Name.Trim(), entry.Name);
      Assert.NotEmpty(entry.Name);
    }
  }

  [Theory]
  [InlineData(-32001, ErrorCodeClass.ServerDefined)]   // registered server-range
  [InlineData(-32050, ErrorCodeClass.ServerDefined)]   // unregistered server-range
  [InlineData(-32003, ErrorCodeClass.McpProtocol)]
  [InlineData(-32700, ErrorCodeClass.JsonRpcStandard)]
  [InlineData(-32500, ErrorCodeClass.JsonRpcStandard)] // unregistered reserved-range
  [InlineData(5000, ErrorCodeClass.ExtensionDefined)]
  public void Classify_error_code_places_every_range_correctly(int code, ErrorCodeClass expected) =>
    Assert.Equal(expected, ErrorRegistry.ClassifyErrorCode(code));

  [Fact]
  public void Reserved_and_server_ranges_have_the_correct_bounds()
  {
    Assert.Equal(new CodeRange(-32768, -32000), ErrorRegistry.JsonRpcReservedRange);
    Assert.Equal(new CodeRange(-32099, -32000), ErrorRegistry.ServerErrorRange);
  }

  [Theory]
  [InlineData(-32001, ErrorCodeClass.ServerDefined, true)]
  [InlineData(-32700, ErrorCodeClass.ServerDefined, false)]
  [InlineData(9000, ErrorCodeClass.ExtensionDefined, true)]
  [InlineData(-32602, ErrorCodeClass.ExtensionDefined, false)]
  [InlineData(-32602, ErrorCodeClass.JsonRpcStandard, true)]
  [InlineData(-32003, ErrorCodeClass.McpProtocol, true)]
  public void Is_error_code_in_class_validates_membership(int code, ErrorCodeClass cls, bool expected) =>
    Assert.Equal(expected, ErrorRegistry.IsErrorCodeInClass(code, cls));

  [Fact]
  public void Legacy_resource_not_found_literal_is_registered_as_mcp_protocol()
  {
    Assert.Equal(-32002, ErrorRegistry.ResourceNotFoundLegacyCode);
    Assert.Equal("Resource not found", ErrorRegistry.Registry[ErrorRegistry.ResourceNotFoundLegacyCode].Name);
    Assert.Equal(ErrorCodeClass.McpProtocol, ErrorRegistry.LookupErrorCode(-32002)!.Class);
  }

  [Fact]
  public void Lookup_returns_null_for_an_unregistered_code()
  {
    Assert.Null(ErrorRegistry.LookupErrorCode(123456));
  }

  // ----- buildErrorObject default-message fill -----

  [Fact]
  public void Build_error_object_fills_a_default_message_from_the_registry()
  {
    Assert.Equal("Parse error", ErrorRegistry.BuildErrorObject(ErrorCodes.ParseError).Message);
    Assert.Equal("Error", ErrorRegistry.BuildErrorObject(-99999).Message);

    var withData = ErrorRegistry.BuildErrorObject(ErrorCodes.InvalidParams, "bad", new JsonObject { ["k"] = 1 });
    Assert.Equal(-32602, withData.Code);
    Assert.Equal("bad", withData.Message);
    Assert.Equal(1, withData.Data!["k"]!.GetValue<int>());

    Assert.Null(ErrorRegistry.BuildErrorObject(ErrorCodes.InvalidParams, "bad").Data);
  }

  // ----- buildNullIdParseErrorResponse -----

  [Fact]
  public void Build_null_id_parse_error_response_uses_a_null_id_and_parse_code()
  {
    var response = ErrorRegistry.BuildNullIdParseErrorResponse();
    Assert.Null(response.Id);
    Assert.Equal(ErrorCodes.ParseError, response.Error.Code);
    Assert.Equal("Parse error", response.Error.Message);
  }
}
