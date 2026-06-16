using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The single, authoritative model for §22 error handling: the full registry of error codes, the
/// classification taxonomy and code ranges, the reserved-code set and extension-code validator, the
/// HTTP-status overlay, the inbound-failure-stage mapping, the canonical resource-not-found mapping,
/// and the firm boundary between a protocol-level JSON-RPC error and a feature-level error result
/// (a tool that ran and failed).
/// </summary>
/// <remarks>
/// The numeric codes themselves already live on <see cref="ErrorCodes"/> (the wire contract); this
/// type re-uses those constants and never redeclares a value. The one code owned by a concurrent
/// feature module — <c>-32002</c> Resource not found — is pinned here as <see cref="ResourceNotFoundLegacyCode"/>
/// so the registry is complete without a forward dependency.
/// </remarks>
public static class ErrorRegistry
{
  /// <summary>
  /// The legacy MCP "Resource not found" error code literal, <c>-32002</c> (§22.4).
  /// </summary>
  /// <remarks>
  /// In §22's registry a <c>resources/read</c> for a non-existent URI is canonically a
  /// <c>-32602</c> Invalid params condition (R-22.4-g) carrying <c>data.uri</c> (R-22.4-h); the
  /// registry also recognises this dedicated <c>-32002</c> literal. The name is suffixed
  /// <c>Legacy</c> to stay collision-free with the Resources feature's own bindings.
  /// </remarks>
  public const int ResourceNotFoundLegacyCode = -32002;

  /// <summary>
  /// The <c>-32602</c> alias used when an invalid or expired cursor is supplied (§18, §22.4). It is
  /// the SAME value as <see cref="ErrorCodes.InvalidParams"/> — a documented alias, never a
  /// distinct code.
  /// </summary>
  public const int InvalidCursorCode = ErrorCodes.InvalidParams;

  // ─── Classification ranges (§22.2, §22.7) ─────────────────────────────────────────────────────

  /// <summary>
  /// The JSON-RPC 2.0 reserved range for pre-defined errors: <c>-32768..-32000</c> inclusive. Codes
  /// outside this range are available for application use (§22.2, §22.7).
  /// </summary>
  public static CodeRange JsonRpcReservedRange { get; } = new(-32768, -32000);

  /// <summary>
  /// The implementation-defined server-error sub-range <c>-32099..-32000</c> inclusive, nested
  /// inside the reserved range; <c>-32001</c> HeaderMismatch lives here (§22.7).
  /// </summary>
  public static CodeRange ServerErrorRange { get; } = new(-32099, -32000);

  // ─── Registry rows (§22.2, §22.3, §6.5) ───────────────────────────────────────────────────────

  /// <summary>
  /// The complete §22 error-code registry, keyed by numeric code. The same <c>code</c> applies on
  /// every transport; the optional <see cref="ErrorCodeRegistryEntry.HttpStatus"/> is the Streamable
  /// HTTP overlay (§22.6). Note that <c>-32602</c> has a single entry even though several distinct
  /// conditions collapse onto it — the code is the key; the condition is conveyed by message/data.
  /// </summary>
  public static IReadOnlyDictionary<int, ErrorCodeRegistryEntry> Registry { get; } = BuildRegistry();

  private static IReadOnlyDictionary<int, ErrorCodeRegistryEntry> BuildRegistry()
  {
    var rows = new ErrorCodeRegistryEntry[]
    {
      new(
        ErrorCodes.ParseError, "Parse error", ErrorCodeClass.JsonRpcStandard,
        "Invalid JSON was received; the byte stream could not be parsed as JSON text.",
        ErrorDataPolicy.SenderDefined),
      new(
        ErrorCodes.InvalidRequest, "Invalid Request", ErrorCodeClass.JsonRpcStandard,
        "Valid JSON, but not a valid JSON-RPC request object.",
        ErrorDataPolicy.SenderDefined),
      new(
        ErrorCodes.MethodNotFound, "Method not found", ErrorCodeClass.JsonRpcStandard,
        "The method does not exist / is not available, including a method gated behind an unadvertised server capability.",
        ErrorDataPolicy.SenderDefined),
      new(
        ErrorCodes.InvalidParams, "Invalid params", ErrorCodeClass.JsonRpcStandard,
        "Invalid or malformed method parameters: unknown tool/prompt/template, invalid tool arguments, missing required prompt argument, invalid/expired cursor, or resource-not-found.",
        ErrorDataPolicy.SenderDefined),
      new(
        ErrorCodes.InternalError, "Internal error", ErrorCodeClass.JsonRpcStandard,
        "An unexpected condition prevented fulfilling an otherwise well-formed request.",
        ErrorDataPolicy.SenderDefined),
      new(
        ErrorCodes.MissingRequiredClientCapability, "MissingRequiredClientCapability", ErrorCodeClass.McpProtocol,
        "The request requires a client capability the client did not declare.",
        ErrorDataPolicy.Normative, ["requiredCapabilities"], HttpStatus: 400),
      new(
        ErrorCodes.UnsupportedProtocolVersion, "UnsupportedProtocolVersion", ErrorCodeClass.McpProtocol,
        "The request's protocol revision is unknown to or unsupported by the server.",
        ErrorDataPolicy.Normative, ["supported", "requested"], HttpStatus: 400),
      new(
        ResourceNotFoundLegacyCode, "Resource not found", ErrorCodeClass.McpProtocol,
        "A requested resource URI does not exist (carries data.uri; §22.4 also maps this to -32602).",
        ErrorDataPolicy.SenderDefined, ["uri"]),
      new(
        ErrorCodes.HeaderMismatch, "HeaderMismatch", ErrorCodeClass.ServerDefined,
        "A routing header (MCP-Protocol-Version, Mcp-Method, Mcp-Name, or a parameter header) is missing, malformed, or mismatched (Streamable HTTP transport).",
        ErrorDataPolicy.SenderDefined, HttpStatus: 400),
    };

    return rows.ToDictionary(static row => row.Code);
  }

  /// <summary>
  /// The reserved codes an extension-defined code MUST NOT collide with: the five standard JSON-RPC
  /// codes, the two protocol-specific codes, and the <c>-32001</c> HeaderMismatch transport code
  /// (R-22.7-c, AC-34.23).
  /// </summary>
  public static IReadOnlyList<int> ReservedErrorCodes { get; } =
  [
    ErrorCodes.ParseError,
    ErrorCodes.InvalidRequest,
    ErrorCodes.MethodNotFound,
    ErrorCodes.InvalidParams,
    ErrorCodes.InternalError,
    ErrorCodes.MissingRequiredClientCapability,
    ErrorCodes.UnsupportedProtocolVersion,
    ErrorCodes.HeaderMismatch,
  ];

  // ─── Registry lookups & classification (§6.5 helpers) ─────────────────────────────────────────

  /// <summary>
  /// Looks up the registry entry for <paramref name="code"/>, or <c>null</c> if it is not a §22
  /// registry code. An absent entry is not an error — receivers MUST tolerate unknown codes (see
  /// <see cref="DescribeUnknownErrorCode"/>). (R-22.7-e)
  /// </summary>
  /// <param name="code">The numeric error code to look up.</param>
  /// <returns>The matching entry, or <c>null</c> when the code is unregistered.</returns>
  public static ErrorCodeRegistryEntry? LookupErrorCode(int code) =>
    Registry.TryGetValue(code, out var entry) ? entry : null;

  /// <summary>
  /// Classifies any integer <paramref name="code"/> into one of the <see cref="ErrorCodeClass"/>
  /// ranges, even codes not present in the registry. A registry entry's own class always wins;
  /// otherwise the code is placed by range (R-22.7-a).
  /// </summary>
  /// <param name="code">The numeric error code to classify.</param>
  /// <returns>The classification the code belongs to.</returns>
  public static ErrorCodeClass ClassifyErrorCode(int code)
  {
    if (LookupErrorCode(code) is { } entry)
    {
      return entry.Class;
    }

    if (ServerErrorRange.Contains(code))
    {
      return ErrorCodeClass.ServerDefined;
    }

    if (JsonRpcReservedRange.Contains(code))
    {
      return ErrorCodeClass.JsonRpcStandard;
    }

    return ErrorCodeClass.ExtensionDefined;
  }

  /// <summary>Returns <c>true</c> when <paramref name="code"/> is one of the eight reserved codes (R-22.7-c).</summary>
  /// <param name="code">The numeric error code to test.</param>
  /// <returns><c>true</c> when the code is reserved.</returns>
  public static bool IsReservedErrorCode(int code) => ReservedErrorCodes.Contains(code);

  /// <summary>
  /// Validates that <paramref name="code"/> is a legal extension-defined error code: an integer
  /// that does not collide with any reserved code (R-22.7-a..c).
  /// </summary>
  /// <remarks>
  /// Because the parameter is already a CLR <see cref="int"/>, the TypeScript <c>not-an-integer</c>
  /// outcome (which guards a JavaScript <c>number</c> that might be fractional) is unreachable from
  /// strongly-typed C# callers; the reason is retained on <see cref="ExtensionCodeValidation"/> for
  /// parity with the TS contract and is returned when a caller deserialises a non-integer code into
  /// this check via the <see cref="ValidateExtensionErrorCode(double)"/> overload.
  /// </remarks>
  /// <param name="code">The candidate extension error code.</param>
  /// <returns>An <see cref="ExtensionCodeValidation"/> describing whether the code is usable.</returns>
  public static ExtensionCodeValidation ValidateExtensionErrorCode(int code) =>
    IsReservedErrorCode(code)
      ? ExtensionCodeValidation.Invalid(ExtensionCodeRejection.CollidesWithReserved)
      : ExtensionCodeValidation.Valid;

  /// <summary>
  /// Validates a possibly-fractional candidate extension code, mirroring the TypeScript
  /// <c>Number.isInteger</c> guard so a non-integer wire value is rejected as
  /// <see cref="ExtensionCodeRejection.NotAnInteger"/> (R-22.7-a).
  /// </summary>
  /// <param name="code">The candidate extension error code, possibly carrying a fractional part.</param>
  /// <returns>An <see cref="ExtensionCodeValidation"/> describing whether the code is usable.</returns>
  public static ExtensionCodeValidation ValidateExtensionErrorCode(double code)
  {
    if (code != Math.Truncate(code) || double.IsNaN(code) || double.IsInfinity(code))
    {
      return ExtensionCodeValidation.Invalid(ExtensionCodeRejection.NotAnInteger);
    }

    // Codes outside the int range cannot collide with a reserved code (all reserved codes are small
    // negatives), so they are valid extension codes.
    if (code < int.MinValue || code > int.MaxValue)
    {
      return ExtensionCodeValidation.Valid;
    }

    return ValidateExtensionErrorCode((int)code);
  }

  /// <summary>
  /// Validates that <paramref name="code"/> is allowed for the given classification (§22.2, §22.7).
  /// </summary>
  /// <param name="code">The numeric error code to test.</param>
  /// <param name="cls">The classification to test membership against.</param>
  /// <returns><c>true</c> when the code is legal for the classification.</returns>
  public static bool IsErrorCodeInClass(int code, ErrorCodeClass cls) => cls switch
  {
    ErrorCodeClass.ServerDefined => ServerErrorRange.Contains(code),
    ErrorCodeClass.ExtensionDefined => !IsReservedErrorCode(code) && !JsonRpcReservedRange.Contains(code),
    ErrorCodeClass.JsonRpcStandard or ErrorCodeClass.McpProtocol => ClassifyErrorCode(code) == cls,
    _ => false,
  };

  // ─── Error object builders (§22) ──────────────────────────────────────────────────────────────

  /// <summary>
  /// Builds a canonical error object. When <paramref name="message"/> is omitted, the registry's
  /// condition name is used so the result always has a non-empty message (falling back to
  /// <c>"Error"</c> for an unregistered code). (R-22.1-c, R-22.1-i, R-22.1-k)
  /// </summary>
  /// <param name="code">The authoritative numeric code.</param>
  /// <param name="message">An optional human-readable message; defaults to the registry name.</param>
  /// <param name="data">Optional structured detail.</param>
  /// <returns>The constructed wire error object.</returns>
  public static JsonRpcError BuildErrorObject(int code, string? message = null, JsonNode? data = null)
  {
    var resolvedMessage = message ?? LookupErrorCode(code)?.Name ?? "Error";
    return new JsonRpcError(code, resolvedMessage, data?.DeepClone());
  }

  /// <summary>
  /// Builds a <c>-32602</c> Invalid params resource-not-found error whose <c>data</c> includes the
  /// requested <paramref name="uri"/>, per the §22.4 canonical mapping (R-22.4-g/h). A non-existent
  /// resource MUST be signalled this way and MUST NOT be signalled by an empty <c>contents</c>
  /// array (R-22.4-i).
  /// </summary>
  /// <param name="uri">The requested resource URI that was not found.</param>
  /// <param name="message">An optional override; defaults to <c>"Resource not found"</c>.</param>
  /// <returns>The constructed wire error object carrying <c>data.uri</c>.</returns>
  public static JsonRpcError BuildResourceNotFoundParamsError(string uri, string message = "Resource not found") =>
    new(ErrorCodes.InvalidParams, message, new JsonObject { ["uri"] = uri });

  /// <summary>
  /// Surfaces an error response carrying a code the receiver does not recognise. Per R-22.7-e a
  /// receiver MUST treat an unknown code as a <em>failed</em> request and surface it using the
  /// message and data, NOT reject it as malformed (AC-34.24).
  /// </summary>
  /// <param name="error">The well-formed error object with an unrecognised code.</param>
  /// <returns>A descriptor a caller can log or propagate.</returns>
  public static UnknownErrorDescriptor DescribeUnknownErrorCode(JsonRpcError error)
  {
    ArgumentNullException.ThrowIfNull(error);
    return new UnknownErrorDescriptor(
      error.Code,
      ClassifyErrorCode(error.Code),
      error.Message,
      error.Data?.DeepClone());
  }

  // ─── Transport error / HTTP status mapping (§22.6) ────────────────────────────────────────────

  /// <summary>
  /// Maps an error <paramref name="code"/> to the Streamable HTTP status it MUST ride on (§22.6).
  /// <c>-32003</c>/<c>-32004</c> (negotiation) and <c>-32001</c> (HeaderMismatch) all map to
  /// <c>400</c>; codes the registry does not pin to a status return <c>null</c>.
  /// </summary>
  /// <param name="code">The numeric error code.</param>
  /// <returns>The HTTP status, or <c>null</c> when none is pinned.</returns>
  public static int? HttpStatusForRegistryCode(int code) => LookupErrorCode(code)?.HttpStatus;

  /// <summary>
  /// Selects the authoritative <c>error.code</c> for a failed-inbound-message stage, per the §22.6
  /// transport mapping (R-22.6-b..f).
  /// </summary>
  /// <param name="stage">The stage at which the inbound message failed validation.</param>
  /// <returns>The authoritative error code for the stage.</returns>
  public static int ErrorCodeForInboundFailure(InboundFailureStage stage) => stage switch
  {
    InboundFailureStage.UnparseableJson => ErrorCodes.ParseError,
    InboundFailureStage.InvalidRequestObject => ErrorCodes.InvalidRequest,
    InboundFailureStage.RoutingHeader => ErrorCodes.HeaderMismatch,
    InboundFailureStage.InvalidMetadata => ErrorCodes.InvalidParams,
    _ => throw new ArgumentOutOfRangeException(nameof(stage), stage, "Unknown inbound failure stage."),
  };

  /// <summary>
  /// Builds the <c>null</c>-id parse-error response for unparseable input — the one circumstance in
  /// which an error response's id need not match a request id (R-22.1-f, R-22.6-h, AC-34.4).
  /// </summary>
  /// <param name="message">An optional override; defaults to <c>"Parse error"</c>.</param>
  /// <returns>An error response with a <c>null</c> id and a <c>-32700</c> error.</returns>
  public static JsonRpcErrorResponse BuildNullIdParseErrorResponse(string message = "Parse error") =>
    new(null, new JsonRpcError(ErrorCodes.ParseError, message));

  // ─── Protocol error vs. feature-level error result (§22.5) ────────────────────────────────────

  /// <summary>
  /// Decides whether a <c>tools/call</c> failure is reported as a JSON-RPC protocol error
  /// (<c>-32602</c>) or as a successful result with <c>isError: true</c> (R-22.5-a..f, AC-34.18).
  /// </summary>
  /// <remarks>
  /// Undispatchable / schema-invalid requests (<see cref="ToolCallFailureSituation.UnknownTool"/>,
  /// <see cref="ToolCallFailureSituation.InvalidArguments"/>) are protocol errors and MUST never
  /// produce <c>isError: true</c>; a tool that ran and failed
  /// (<see cref="ToolCallFailureSituation.ExecutionFailure"/>) is an error result and MUST never
  /// produce a JSON-RPC error. The mapping is total and never the reverse.
  /// </remarks>
  /// <param name="situation">The situation the failure arose from.</param>
  /// <returns>The mechanism the failure MUST be reported with.</returns>
  public static ToolFailureMechanism ClassifyToolCallFailure(ToolCallFailureSituation situation) => situation switch
  {
    ToolCallFailureSituation.UnknownTool or ToolCallFailureSituation.InvalidArguments
      => ToolFailureMechanism.ProtocolError,
    ToolCallFailureSituation.ExecutionFailure => ToolFailureMechanism.ErrorResult,
    _ => throw new ArgumentOutOfRangeException(nameof(situation), situation, "Unknown tool-call failure situation."),
  };
}

/// <summary>A closed numeric range <c>[Min, Max]</c> inclusive, used to classify error codes (§22.2, §22.7).</summary>
/// <param name="Min">The inclusive lower bound.</param>
/// <param name="Max">The inclusive upper bound.</param>
public readonly record struct CodeRange(int Min, int Max)
{
  /// <summary>Returns <c>true</c> when <paramref name="code"/> lies within <c>[Min, Max]</c> inclusive.</summary>
  /// <param name="code">The code to test.</param>
  /// <returns><c>true</c> when the code is in range.</returns>
  public bool Contains(int code) => code >= Min && code <= Max;
}

/// <summary>
/// The three (plus extension) classes a JSON-RPC error code can fall into, per §22. The numeric
/// code is authoritative; this taxonomy lets a receiver reason about a code it has never seen
/// (R-22.1-h, R-22.7-a, R-22.7-e).
/// </summary>
public enum ErrorCodeClass
{
  /// <summary>The reserved JSON-RPC pre-defined codes (<c>-32700</c>, <c>-32600..-32603</c>).</summary>
  JsonRpcStandard,

  /// <summary>MCP protocol-specific codes (<c>-32003</c>, <c>-32004</c>, <c>-32002</c>) with normative data (§22.3).</summary>
  McpProtocol,

  /// <summary>The implementation-defined server-error range <c>-32000..-32099</c> (§22.7).</summary>
  ServerDefined,

  /// <summary>Any integer outside every reserved/server range — extension-defined (§22.7).</summary>
  ExtensionDefined,
}

/// <summary>
/// Whether a code's <c>data</c> shape is normative (fixed by the spec) or sender-defined (the
/// sender MAY attach any structure). (R-22.1-k, R-22.3-a)
/// </summary>
public enum ErrorDataPolicy
{
  /// <summary>The <c>data</c> shape is fixed by the spec and carries the keys in <see cref="ErrorCodeRegistryEntry.DataKeys"/>.</summary>
  Normative,

  /// <summary>The sender MAY attach any (or no) structured <c>data</c>.</summary>
  SenderDefined,
}

/// <summary>One row of the §22 error-code registry (§6.5).</summary>
/// <param name="Code">The authoritative numeric code (R-22.1-h).</param>
/// <param name="Name">The canonical, case-sensitive condition name, exactly as in §22 (R-22-a).</param>
/// <param name="Class">Which classification range this code belongs to.</param>
/// <param name="Meaning">A one-line meaning of the condition the code signals.</param>
/// <param name="DataPolicy">Whether <c>error.data</c> is spec-normative or sender-defined (R-22.1-k, R-22.3-a).</param>
/// <param name="DataKeys">The keys a normative <c>data</c> payload MUST carry, if any (R-22.3-a).</param>
/// <param name="HttpStatus">The Streamable HTTP status this code maps to, if any (§22.6).</param>
public sealed record ErrorCodeRegistryEntry(
  int Code,
  string Name,
  ErrorCodeClass Class,
  string Meaning,
  ErrorDataPolicy DataPolicy,
  IReadOnlyList<string>? DataKeys = null,
  int? HttpStatus = null);

/// <summary>The reason an extension error code was rejected by <see cref="ErrorRegistry.ValidateExtensionErrorCode(int)"/>.</summary>
public enum ExtensionCodeRejection
{
  /// <summary>The candidate value was not an integer (R-22.7-a).</summary>
  NotAnInteger,

  /// <summary>The candidate integer collides with one of the reserved codes (R-22.7-c).</summary>
  CollidesWithReserved,
}

/// <summary>The outcome of validating a candidate extension error code (R-22.7-a..c).</summary>
/// <param name="Ok">Whether the code is a usable extension code.</param>
/// <param name="Reason">When <see cref="Ok"/> is <c>false</c>, the reason it was rejected.</param>
public readonly record struct ExtensionCodeValidation(bool Ok, ExtensionCodeRejection? Reason)
{
  /// <summary>A successful validation result.</summary>
  public static ExtensionCodeValidation Valid { get; } = new(true, null);

  /// <summary>Builds a failed validation result carrying the rejection <paramref name="reason"/>.</summary>
  /// <param name="reason">Why the code was rejected.</param>
  /// <returns>A failed validation result.</returns>
  public static ExtensionCodeValidation Invalid(ExtensionCodeRejection reason) => new(false, reason);
}

/// <summary>
/// A descriptor for an error response carrying an unrecognised code, surfaced as a failed request
/// rather than rejected as malformed (R-22.7-e, AC-34.24).
/// </summary>
/// <param name="Code">The unrecognised numeric code.</param>
/// <param name="Class">The classification range the code falls into.</param>
/// <param name="Message">The error's human-readable message.</param>
/// <param name="Data">The error's optional structured data, if any.</param>
public sealed record UnknownErrorDescriptor(int Code, ErrorCodeClass Class, string Message, JsonNode? Data)
{
  /// <summary>Always <c>true</c>: an unknown code marks the request as failed, never rejected-as-malformed.</summary>
  public bool Failed => true;
}

/// <summary>
/// The stage at which an inbound message failed validation, used to select the authoritative
/// <c>error.code</c> per the §22.6 classification pipeline.
/// </summary>
public enum InboundFailureStage
{
  /// <summary>Bytes were not parseable as JSON → <c>-32700</c> (R-22.6-e).</summary>
  UnparseableJson,

  /// <summary>Parsed JSON is not a valid request object (and not a routing failure) → <c>-32600</c> (R-22.6-c/f).</summary>
  InvalidRequestObject,

  /// <summary>A routing header is missing/malformed/mismatched (HTTP) → <c>-32001</c> (R-22.6-b).</summary>
  RoutingHeader,

  /// <summary>Required per-request metadata is missing/invalid → <c>-32602</c> (R-22.6-d).</summary>
  InvalidMetadata,
}

/// <summary>
/// The two distinct mechanisms for reporting that something went wrong with a <c>tools/call</c>.
/// Choosing the correct one is a MUST (R-22.5-a, AC-34.18).
/// </summary>
public enum ToolFailureMechanism
{
  /// <summary>A JSON-RPC <c>error</c> (<c>-32602</c>): the request could not be dispatched (R-22.5-c).</summary>
  ProtocolError,

  /// <summary>A successful <c>result</c> with <c>isError: true</c>: the tool ran but failed (R-22.5-b).</summary>
  ErrorResult,
}

/// <summary>The situations a <c>tools/call</c> failure can arise from, used to pick the reporting mechanism (§22.5).</summary>
public enum ToolCallFailureSituation
{
  /// <summary>The tool name is not exposed by the server (R-22.5-c).</summary>
  UnknownTool,

  /// <summary>The arguments fail the tool's declared input schema (R-22.5-c).</summary>
  InvalidArguments,

  /// <summary>The tool was dispatched and ran, but its work failed (R-22.5-d).</summary>
  ExecutionFailure,
}
