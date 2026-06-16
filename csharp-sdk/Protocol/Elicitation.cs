using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// The parameters of an <c>elicitation/create</c> input request (spec §20.2). Elicitation lets a
/// server request structured input from the user through the client; it is delivered as an
/// input-required result and answered by retrying the originating request (§11). This is a closed
/// union of two mode-specific shapes (spec §20.3) discriminated by the <c>mode</c> field:
/// <see cref="ElicitRequestFormParams"/> (<c>"form"</c>) and <see cref="ElicitRequestURLParams"/>
/// (<c>"url"</c>).
/// </summary>
/// <remarks>
/// The form-mode discriminator is OPTIONAL on the wire — a request with no <c>mode</c> field MUST be
/// treated as form mode (§20.3). Serialization therefore writes <c>"mode": "form"</c> explicitly,
/// while a deserializer that defaults a missing discriminator to <see cref="ElicitRequestFormParams"/>
/// preserves that backwards-compatibility rule.
/// </remarks>
[JsonConverter(typeof(ElicitRequestParamsConverter))]
public abstract record ElicitRequestParams
{
  private protected ElicitRequestParams() { }

  /// <summary>REQUIRED. Human-readable text describing what is requested and/or why (spec §20.3).</summary>
  public required string Message { get; init; }
}

/// <summary>
/// Serializes the <see cref="ElicitRequestParams"/> union by its <c>mode</c> discriminator, and on read
/// treats a MISSING <c>mode</c> as form mode — the backwards-compatibility rule of §20.3 that the
/// built-in polymorphic deserializer cannot express. Field access is explicit, so there is no recursion
/// back into this converter.
/// </summary>
internal sealed class ElicitRequestParamsConverter : JsonConverter<ElicitRequestParams>
{
  public override ElicitRequestParams Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
  {
    if (JsonNode.Parse(ref reader) is not JsonObject obj)
    {
      throw new JsonException("Elicitation params must be a JSON object.");
    }
    var message = (obj["message"] as JsonValue)?.GetValue<string>()
      ?? throw new JsonException("Elicitation params require a \"message\".");
    var mode = (obj["mode"] as JsonValue)?.GetValue<string>() ?? "form"; // §20.3: absent ⇒ form

    return mode == "url"
      ? new ElicitRequestURLParams
      {
        Message = message,
        ElicitationId = (obj["elicitationId"] as JsonValue)?.GetValue<string>() ?? throw new JsonException("URL elicitation requires \"elicitationId\"."),
        Url = (obj["url"] as JsonValue)?.GetValue<string>() ?? throw new JsonException("URL elicitation requires \"url\"."),
      }
      : new ElicitRequestFormParams
      {
        Message = message,
        RequestedSchema = obj["requestedSchema"] as JsonObject ?? throw new JsonException("Form elicitation requires \"requestedSchema\"."),
      };
  }

  public override void Write(Utf8JsonWriter writer, ElicitRequestParams value, JsonSerializerOptions options)
  {
    writer.WriteStartObject();
    writer.WriteString("mode", value is ElicitRequestURLParams ? "url" : "form");
    writer.WriteString("message", value.Message);
    switch (value)
    {
      case ElicitRequestFormParams form:
        writer.WritePropertyName("requestedSchema");
        form.RequestedSchema.WriteTo(writer, options);
        break;
      case ElicitRequestURLParams url:
        writer.WriteString("elicitationId", url.ElicitationId);
        writer.WriteString("url", url.Url);
        break;
    }
    writer.WriteEndObject();
  }
}

/// <summary>
/// Form-mode elicitation parameters (spec §20.3, <c>mode: "form"</c>): in-band structured data
/// collection against a restricted JSON Schema. The collected data IS exposed to the client, so a
/// server MUST NOT use form mode for sensitive information such as passwords, API keys, tokens, or
/// payment credentials (§20.7).
/// </summary>
public sealed record ElicitRequestFormParams : ElicitRequestParams
{
  /// <summary>
  /// REQUIRED. The restricted JSON Schema describing the fields to collect (spec §20.3/§20.4).
  /// Its root <c>type</c> MUST be <c>"object"</c>; <c>properties</c> is a flat, non-nested map from
  /// field name to a <c>PrimitiveSchemaDefinition</c> (string, number/integer, boolean, or enum —
  /// see §20.4); <c>required</c> is an OPTIONAL array of property names; <c>$schema</c> is an
  /// OPTIONAL dialect identifier. Modeled as a raw <see cref="JsonObject"/> (mirroring how
  /// <c>Tool.InputSchema</c> is represented) because it carries an open, restricted-Schema fragment.
  /// </summary>
  public required JsonObject RequestedSchema { get; init; }
}

/// <summary>
/// URL-mode elicitation parameters (spec §20.3, <c>mode: "url"</c>): out-of-band interaction via
/// navigation to a URL. Data other than the URL itself is NOT exposed to the client, making this
/// the mode a server MUST use for sensitive flows such as authorization or payment (§20.7).
/// </summary>
public sealed record ElicitRequestURLParams : ElicitRequestParams
{
  /// <summary>
  /// REQUIRED. An opaque correlation identifier that uniquely identifies the elicitation within the
  /// server's context (spec §20.3). The client MUST treat it as opaque; it correlates this request
  /// with the elicitation-complete notification of §20.6.
  /// </summary>
  public required string ElicitationId { get; init; }

  /// <summary>
  /// REQUIRED. The URL the user should navigate to (spec §20.3). MUST be a valid URI [RFC3986]
  /// containing a valid URL. The client MUST NOT pre-fetch it or open it without explicit user
  /// consent (§20.7).
  /// </summary>
  public required string Url { get; init; }
}

/// <summary>
/// The user's response action to an elicitation request (spec §20.5). Exactly one of these literals
/// is returned in <see cref="ElicitResult.Action"/>; the distinctions apply to both form and URL
/// modes.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<ElicitationAction>))]
public enum ElicitationAction
{
  /// <summary>The user explicitly approved and submitted (spec §20.5). For form mode, the result carries the collected <c>content</c>; for URL mode it signals consent to the interaction, not its completion.</summary>
  [JsonStringEnumMemberName("accept")]
  Accept,

  /// <summary>The user explicitly declined the request (spec §20.5). <c>content</c> is typically omitted.</summary>
  [JsonStringEnumMemberName("decline")]
  Decline,

  /// <summary>The user dismissed without an explicit choice — for example closed the dialog, clicked away, pressed Escape, or the URL failed to load (spec §20.5). <c>content</c> is typically omitted.</summary>
  [JsonStringEnumMemberName("cancel")]
  Cancel,
}

/// <summary>
/// The client's response to an elicitation request, supplied as the input on retry (spec §20.5).
/// </summary>
public sealed record ElicitResult
{
  /// <summary>REQUIRED. The user's response action (spec §20.5).</summary>
  public required ElicitationAction Action { get; init; }

  /// <summary>
  /// OPTIONAL. The collected field values (spec §20.5). Present only when <see cref="Action"/> is
  /// <see cref="ElicitationAction.Accept"/> and the mode was form; omitted for URL-mode responses
  /// and typically for decline/cancel. When present, each value is a string, number, boolean, or
  /// array of strings, and the map MUST conform to the request's <c>requestedSchema</c>.
  /// </summary>
  public JsonObject? Content { get; init; }

  /// <summary>OPTIONAL. Implementation- and extension-specific metadata (spec §4).</summary>
  [JsonPropertyName("_meta")]
  public JsonObject? Meta { get; init; }
}

/// <summary>
/// The parameters of the <c>notifications/elicitation/complete</c> notification (spec §20.6), which a
/// server MAY send to signal that a URL-mode out-of-band interaction has completed. A client MUST
/// ignore a notification referencing an unknown or already-completed <see cref="ElicitationId"/>.
/// </summary>
public sealed record ElicitationCompleteNotificationParams
{
  /// <summary>The JSON-RPC method name of this notification (spec §20.6).</summary>
  public const string Method = "notifications/elicitation/complete";

  /// <summary>
  /// REQUIRED. The identifier of the elicitation that completed (spec §20.6). It MUST match the
  /// <see cref="ElicitRequestURLParams.ElicitationId"/> established in the original URL-mode
  /// <c>elicitation/create</c> request.
  /// </summary>
  public required string ElicitationId { get; init; }
}

/// <summary>
/// S30 — Elicitation I: the front-half capability/delivery/mode logic (spec §20.1–§20.3). The C#
/// counterpart of the TypeScript <c>protocol/elicitation.ts</c> module: mode constants and resolution,
/// server-side capability gating (R-20.1-d/e), URL validity, and the request builders.
/// </summary>
/// <remarks>
/// <para>
/// An elicitation request is NOT a server-initiated JSON-RPC request: the server returns an
/// <c>input_required</c> result carrying an <c>elicitation/create</c> request (the §11 multi-round-trip
/// mechanism), and the client supplies the user's input by retrying the originating request. This class
/// owns the rules around <em>whether</em> a server may send such a request and <em>how</em> to build it;
/// the wire records (<see cref="ElicitRequestParams"/> and friends) and the payload/outcome surface
/// (<see cref="ElicitationForm"/>) live elsewhere.
/// </para>
/// <para>
/// Capability gating reuses the foundation's raw-map predicates
/// (<see cref="CapabilityNegotiation.ClientDeclares"/> and
/// <see cref="CapabilityNegotiation.MayUseUrlElicitation"/>) so the rules apply uniformly to a client
/// capabilities map arriving on the wire.
/// </para>
/// </remarks>
public static class Elicitation
{
  /// <summary>
  /// The exact, case-sensitive <c>method</c> literal that identifies an elicitation input request
  /// within the multi-round-trip input-request union (spec §20.2, R-20.2-b).
  /// </summary>
  public const string CreateMethod = "elicitation/create";

  /// <summary>The form-mode discriminator value: in-band structured collection (spec §20.3, R-20.3-a).</summary>
  public const string FormMode = "form";

  /// <summary>The url-mode discriminator value: out-of-band navigation (spec §20.3, R-20.3-i).</summary>
  public const string UrlMode = "url";

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is one of the two defined elicitation modes (spec §20.3).</summary>
  /// <param name="value">The candidate mode string.</param>
  /// <returns><c>true</c> when <c>"form"</c> or <c>"url"</c>.</returns>
  public static bool IsElicitationMode(string? value) => value is FormMode or UrlMode;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> carries the exact, case-sensitive
  /// <c>"elicitation/create"</c> method literal (spec §20.2, R-20.2-b). This is a lightweight
  /// method-only check; it does not validate <c>params</c>.
  /// </summary>
  /// <param name="value">The raw request node.</param>
  /// <returns><c>true</c> when the method literal matches.</returns>
  public static bool IsElicitationCreateRequest(JsonNode? value) =>
    value is JsonObject obj &&
    obj["method"] is JsonValue methodValue &&
    methodValue.GetValueKind() == JsonValueKind.String &&
    methodValue.GetValue<string>() == CreateMethod;

  /// <summary>
  /// Resolves the effective elicitation mode of a <c>params</c> object, applying the
  /// backwards-compatibility rule that an absent <c>mode</c> means form mode (spec §20.3, R-20.3-b,
  /// R-20.3-c). Returns <c>"form"</c> when <c>mode</c> is absent or the literal <c>"form"</c>,
  /// <c>"url"</c> when it is the literal <c>"url"</c>, and <c>null</c> for any other (malformed) value.
  /// </summary>
  /// <param name="prms">An <c>ElicitRequestParams</c>-shaped object.</param>
  /// <returns>The resolved mode, or <c>null</c> when malformed.</returns>
  public static string? ResolveElicitationMode(JsonNode? prms)
  {
    if (prms is not JsonObject obj) return null;
    if (!obj.TryGetPropertyValue("mode", out var modeNode) || modeNode is null) return FormMode; // absent ⇒ form
    if (modeNode is not JsonValue modeValue || modeValue.GetValueKind() != JsonValueKind.String) return null;
    var mode = modeValue.GetValue<string>();
    if (mode == FormMode) return FormMode;
    if (mode == UrlMode) return UrlMode;
    return null;
  }

  /// <summary>
  /// Returns <c>true</c> when <paramref name="url"/> is a valid, absolute URI/URL — the requirement on
  /// the url-mode <c>url</c> field (spec §20.3, R-20.3-m, R-20.3-n). Relative references and malformed
  /// strings are rejected.
  /// </summary>
  /// <param name="url">The candidate URL.</param>
  /// <returns><c>true</c> when a valid absolute URL.</returns>
  public static bool IsValidElicitationUrl(string? url) =>
    ElicitationForm.TryParseWhatwgUrl(url, out _);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="clientCaps"/> declares the <c>elicitation</c> capability —
  /// the MUST-declare-to-use rule (spec §20.1, R-20.1-a). A client that does not declare it is treated
  /// as not supporting elicitation.
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities (raw map).</param>
  /// <returns><c>true</c> when elicitation is declared.</returns>
  public static bool ClientSupportsElicitation(JsonObject clientCaps)
  {
    ArgumentNullException.ThrowIfNull(clientCaps);
    return CapabilityNegotiation.ClientDeclares(clientCaps, "elicitation");
  }

  /// <summary>
  /// Returns the set of elicitation modes a client supports, applying the empty-object-equals-form-only
  /// equivalence: declaring <c>elicitation</c> always implies <c>form</c> (the implicit baseline), and
  /// <c>url</c> is added only when the <c>elicitation.url</c> sub-flag is present (spec §20.1, R-20.1-c,
  /// R-20.1-f). Returns an empty list when <c>elicitation</c> is not declared at all.
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities (raw map).</param>
  /// <returns>The supported modes (<c>[]</c>, <c>["form"]</c>, or <c>["form","url"]</c>).</returns>
  public static IReadOnlyList<string> SupportedElicitationModes(JsonObject clientCaps)
  {
    ArgumentNullException.ThrowIfNull(clientCaps);
    if (!CapabilityNegotiation.ClientDeclares(clientCaps, "elicitation")) return [];
    var modes = new List<string> { FormMode };
    if (CapabilityNegotiation.MayUseUrlElicitation(clientCaps)) modes.Add(UrlMode);
    return modes;
  }

  /// <summary>
  /// Returns <c>true</c> when the client declaring <paramref name="clientCaps"/> supports
  /// <paramref name="mode"/>, applying the empty-object-equals-form-only equivalence (spec §20.1,
  /// R-20.1-c, R-20.1-f). <c>form</c> is supported whenever <c>elicitation</c> is declared; <c>url</c>
  /// requires the <c>elicitation.url</c> sub-flag.
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities (raw map).</param>
  /// <param name="mode">The mode to test.</param>
  /// <returns><c>true</c> when the mode is supported.</returns>
  public static bool ClientSupportsElicitationMode(JsonObject clientCaps, string mode) =>
    SupportedElicitationModes(clientCaps).Contains(mode);

  /// <summary>Why a server may not emit an <c>elicitation/create</c> request, per the §20.1 gating rules.</summary>
  public enum ElicitationGateRejection
  {
    /// <summary>No rejection (the request is permitted).</summary>
    None,

    /// <summary>The client did not declare the <c>elicitation</c> capability (R-20.1-e).</summary>
    CapabilityNotDeclared,

    /// <summary>The client declared <c>elicitation</c> but not the requested <c>mode</c> (R-20.1-d).</summary>
    ModeNotSupported,
  }

  /// <summary>Outcome of <see cref="GateElicitationRequest"/>.</summary>
  /// <param name="Ok"><c>true</c> when the server MAY send the request.</param>
  /// <param name="Reason">The rejection reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="Mode">The requested mode echoed on a <see cref="ElicitationGateRejection.ModeNotSupported"/> rejection; otherwise <c>null</c>.</param>
  public readonly record struct ElicitationGateResult(bool Ok, ElicitationGateRejection Reason, string? Mode);

  /// <summary>
  /// Decides whether a server MAY send an <c>elicitation/create</c> request of <paramref name="mode"/>
  /// to a client with the given declared capabilities (spec §20.1, R-20.1-d, R-20.1-e). A server MUST
  /// NOT return such a request to a client that has not declared <c>elicitation</c>
  /// (<see cref="ElicitationGateRejection.CapabilityNotDeclared"/>), nor one whose <c>mode</c> the
  /// client's declared sub-flags do not support
  /// (<see cref="ElicitationGateRejection.ModeNotSupported"/>).
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities (raw map).</param>
  /// <param name="mode">The mode the server intends to use; defaults to <c>"form"</c> (the absent-mode baseline, R-20.3-c).</param>
  /// <returns>The gate result.</returns>
  public static ElicitationGateResult GateElicitationRequest(JsonObject clientCaps, string mode = FormMode)
  {
    ArgumentNullException.ThrowIfNull(clientCaps);
    if (!CapabilityNegotiation.ClientDeclares(clientCaps, "elicitation"))
    {
      return new ElicitationGateResult(false, ElicitationGateRejection.CapabilityNotDeclared, null);
    }
    if (!ClientSupportsElicitationMode(clientCaps, mode))
    {
      return new ElicitationGateResult(false, ElicitationGateRejection.ModeNotSupported, mode);
    }
    return new ElicitationGateResult(true, ElicitationGateRejection.None, null);
  }

  /// <summary>
  /// Convenience predicate: <c>true</c> exactly when <see cref="GateElicitationRequest"/> permits a
  /// server to send an <c>elicitation/create</c> request of <paramref name="mode"/> (spec §20.1,
  /// R-20.1-d, R-20.1-e).
  /// </summary>
  /// <param name="clientCaps">The client's declared capabilities (raw map).</param>
  /// <param name="mode">The mode the server intends to use; defaults to <c>"form"</c>.</param>
  /// <returns><c>true</c> when permitted.</returns>
  public static bool MayServerSendElicitation(JsonObject clientCaps, string mode = FormMode) =>
    GateElicitationRequest(clientCaps, mode).Ok;

  /// <summary>
  /// Builds a well-formed form-mode <see cref="ElicitRequestFormParams"/> (spec §20.2, §20.3). The
  /// <paramref name="requestedSchema"/> is validated against the §20.4 restricted form schema before the
  /// request is built (R-20.4); a malformed schema is rejected rather than sent. Form mode is the
  /// implicit baseline, so the <c>mode</c> field is not modeled on the record (it is emitted on the wire
  /// by the converter).
  /// </summary>
  /// <param name="message">The human-readable description of what is requested.</param>
  /// <param name="requestedSchema">The restricted form schema describing the fields to collect.</param>
  /// <returns>The form-mode params.</returns>
  /// <exception cref="ArgumentException">When <paramref name="requestedSchema"/> violates the restriction (§20.4).</exception>
  public static ElicitRequestFormParams BuildFormElicitRequest(string message, JsonObject requestedSchema)
  {
    ArgumentNullException.ThrowIfNull(message);
    ArgumentNullException.ThrowIfNull(requestedSchema);
    var validation = ElicitationForm.ValidateRestrictedFormSchema(requestedSchema);
    if (!validation.Valid)
    {
      var detail = string.Join("; ", validation.Errors.Select(e => $"{e.Path}: {e.Detail}"));
      throw new ArgumentException($"Invalid requestedSchema for form elicitation: {detail}", nameof(requestedSchema));
    }
    return new ElicitRequestFormParams { Message = message, RequestedSchema = requestedSchema };
  }

  /// <summary>
  /// Builds a well-formed url-mode <see cref="ElicitRequestURLParams"/> (spec §20.2, §20.3). The
  /// <c>url</c> is checked for validity (R-20.3-n) and the <c>elicitationId</c> for non-emptiness
  /// (R-20.3-k) before the request is built.
  /// </summary>
  /// <param name="message">The explanation of why the interaction is needed.</param>
  /// <param name="elicitationId">The opaque server-scoped correlation id; MUST be non-empty.</param>
  /// <param name="url">The URL the user navigates to; MUST be a valid absolute URL.</param>
  /// <returns>The url-mode params.</returns>
  /// <exception cref="ArgumentException">When <paramref name="elicitationId"/> is empty (R-20.3-k) or <paramref name="url"/> is invalid (R-20.3-n).</exception>
  public static ElicitRequestURLParams BuildUrlElicitRequest(string message, string elicitationId, string url)
  {
    ArgumentNullException.ThrowIfNull(message);
    if (string.IsNullOrEmpty(elicitationId))
    {
      throw new ArgumentException("url-mode elicitation requires a non-empty elicitationId (R-20.3-k)", nameof(elicitationId));
    }
    if (!IsValidElicitationUrl(url))
    {
      throw new ArgumentException($"url-mode elicitation requires a valid URL; got \"{url}\" (R-20.3-n)", nameof(url));
    }
    return new ElicitRequestURLParams { Message = message, ElicitationId = elicitationId, Url = url };
  }
}
