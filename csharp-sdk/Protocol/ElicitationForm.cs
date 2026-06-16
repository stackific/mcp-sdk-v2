using System.Text.Json;
using System.Text.Json.Nodes;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// S31 — Elicitation II: the restricted form-schema system, result-action semantics, the §20.6
/// completion notification handler, and the §20.7 consent/security helpers (spec §20.4–§20.8).
/// The C# counterpart of the TypeScript <c>protocol/elicitation-form.ts</c> module.
/// </summary>
/// <remarks>
/// <para>
/// S30 (<see cref="Elicitation"/> / the wire records in <c>Elicitation.cs</c>) routed and
/// modeled an elicitation: the capability, the input-required delivery of an
/// <c>elicitation/create</c> request, and the <c>form</c>/<c>url</c> mode parameter shapes, including
/// the structural <c>requestedSchema</c> container (a flat object of primitives). This module fills in
/// the PAYLOAD and OUTCOME surface those modes require:
/// </para>
/// <list type="bullet">
///   <item>the <c>PrimitiveSchemaDefinition</c> value type behind <c>requestedSchema.properties</c> —
///     the four primitive field schemas (string / number / boolean) and the <c>EnumSchema</c> family
///     (single/multi-select, titled or untitled, plus the Deprecated legacy <c>enumNames</c> form);</item>
///   <item>a full §20.4 restricted-schema validator that checks each property is a valid primitive;</item>
///   <item>a validator for the <c>content</c> a client returns on <c>accept</c> against that schema,
///     and the <c>ElicitResult</c> action semantics (accept / decline / cancel, presence-of-content
///     rules);</item>
///   <item>the <c>notifications/elicitation/complete</c> server→client notification with its
///     send/ignore rules (§20.6);</item>
///   <item>the consent / security predicates: sensitive-data form-mode prohibition, URL-mode
///     identity binding and anti-phishing checks, safe URL construction (server) and safe URL handling
///     (client) (§20.7).</item>
/// </list>
/// <para>
/// JSON Schema fragments are modeled as raw <see cref="JsonNode"/> / <see cref="JsonObject"/> values
/// (mirroring the open, restricted-Schema shape carried in <c>requestedSchema.properties</c>); the
/// classifiers and validators inspect them structurally, exactly as the TS module does. None of this
/// code performs any I/O, rendering, or network access.
/// </para>
/// </remarks>
public static class ElicitationForm
{
  // ─── Helpers ───────────────────────────────────────────────────────────────────

  /// <summary>Returns the JSON object under <paramref name="node"/>, or <c>null</c> when it is not an object.</summary>
  private static JsonObject? AsObject(JsonNode? node) => node as JsonObject;

  /// <summary>Returns the string value of <paramref name="node"/>, or <c>null</c> when it is not a JSON string.</summary>
  private static string? AsString(JsonNode? node) =>
    node is JsonValue v && v.GetValueKind() == JsonValueKind.String ? v.GetValue<string>() : null;

  /// <summary>Returns the array under <paramref name="node"/>, or <c>null</c> when it is not an array.</summary>
  private static JsonArray? AsArray(JsonNode? node) => node as JsonArray;

  /// <summary>Returns <c>true</c> when <paramref name="parent"/> has a child <paramref name="key"/> that is a JSON array.</summary>
  private static bool HasArray(JsonObject parent, string key) => parent[key] is JsonArray;

  /// <summary>
  /// Parses <paramref name="url"/> as an ABSOLUTE URL the way the WHATWG <c>URL</c> constructor does —
  /// requiring an explicit <c>scheme:</c> prefix (so a scheme-relative <c>//host</c> or path-absolute
  /// <c>/path</c> reference is rejected, even though .NET's <see cref="Uri"/> would otherwise synthesize
  /// a <c>file:</c> scheme for them). Returns <c>false</c> for empty, relative, or malformed input.
  /// </summary>
  /// <remarks>
  /// This is the single URL-parse gate behind <see cref="Elicitation.IsValidElicitationUrl"/>,
  /// <see cref="CheckElicitationUrlSafety"/>, and <see cref="BuildUrlConsentPresentation"/>, keeping them
  /// byte-for-byte faithful to the TypeScript SDK's <c>new URL(url)</c> behavior.
  /// </remarks>
  internal static bool TryParseWhatwgUrl(string? url, out Uri parsed)
  {
    parsed = null!;
    if (string.IsNullOrEmpty(url)) return false;
    // WHATWG absolute URLs begin with `scheme:` where scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ).
    var colon = url.IndexOf(':');
    if (colon <= 0) return false;
    var scheme = url[..colon];
    if (!char.IsAsciiLetter(scheme[0])) return false;
    for (var i = 1; i < scheme.Length; i++)
    {
      var c = scheme[i];
      if (!char.IsAsciiLetterOrDigit(c) && c is not ('+' or '-' or '.')) return false;
    }
    return Uri.TryCreate(url, UriKind.Absolute, out parsed!);
  }

  // ─── StringSchema (§20.4) ──────────────────────────────────────────────────────

  /// <summary>
  /// The four permitted <c>StringSchema.format</c> literals (spec §20.4, R-20.4-d). A <c>format</c>,
  /// when present, MUST be exactly one of these; any other value (e.g. <c>"phone"</c>) is rejected.
  /// </summary>
  public static IReadOnlyList<string> StringSchemaFormats { get; } =
    ["email", "uri", "date", "date-time"];

  private static readonly HashSet<string> StringSchemaFormatSet =
    new(StringSchemaFormats, StringComparer.Ordinal);

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is one of the four permitted string formats (spec R-20.4-d).</summary>
  /// <param name="value">The candidate <c>format</c> value.</param>
  /// <returns><c>true</c> when permitted.</returns>
  public static bool IsStringSchemaFormat(JsonNode? value) =>
    AsString(value) is { } s && StringSchemaFormatSet.Contains(s);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a valid free-text <c>StringSchema</c> — a JSON
  /// object whose <c>type</c> is exactly <c>"string"</c>, carrying no <c>enum</c>/<c>oneOf</c> (which
  /// would make it an enum member), with any present <c>minLength</c>/<c>maxLength</c> numeric and any
  /// present <c>format</c> one of the four permitted formats (spec §20.4, R-20.4-c, R-20.4-d).
  /// </summary>
  /// <param name="value">The candidate property schema.</param>
  /// <returns><c>true</c> when a valid free-text string schema.</returns>
  public static bool IsStringSchema(JsonNode? value)
  {
    if (AsObject(value) is not { } obj) return false;
    if (AsString(obj["type"]) != "string") return false;
    // The free-text string schema carries no enum/oneOf — those select an EnumSchema member instead.
    if (obj.ContainsKey("enum") || obj.ContainsKey("oneOf")) return false;
    if (obj.TryGetPropertyValue("minLength", out var min) && !IsNumber(min)) return false;
    if (obj.TryGetPropertyValue("maxLength", out var max) && !IsNumber(max)) return false;
    if (obj.TryGetPropertyValue("format", out var fmt) && fmt is not null && !IsStringSchemaFormat(fmt)) return false;
    return true;
  }

  // ─── NumberSchema (§20.4) ──────────────────────────────────────────────────────

  /// <summary>The two permitted <c>NumberSchema.type</c> literals (spec §20.4, R-20.4-e).</summary>
  public static IReadOnlyList<string> NumberSchemaTypes { get; } = ["number", "integer"];

  private static readonly HashSet<string> NumberSchemaTypeSet =
    new(NumberSchemaTypes, StringComparer.Ordinal);

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a valid <c>NumberSchema</c> — a JSON object
  /// whose <c>type</c> is <c>"number"</c> or <c>"integer"</c>, with any present
  /// <c>minimum</c>/<c>maximum</c> numeric (spec §20.4, R-20.4-c, R-20.4-e).
  /// </summary>
  /// <param name="value">The candidate property schema.</param>
  /// <returns><c>true</c> when a valid number schema.</returns>
  public static bool IsNumberSchema(JsonNode? value)
  {
    if (AsObject(value) is not { } obj) return false;
    if (AsString(obj["type"]) is not { } type || !NumberSchemaTypeSet.Contains(type)) return false;
    if (obj.TryGetPropertyValue("minimum", out var min) && !IsNumber(min)) return false;
    if (obj.TryGetPropertyValue("maximum", out var max) && !IsNumber(max)) return false;
    return true;
  }

  // ─── BooleanSchema (§20.4) ─────────────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a valid <c>BooleanSchema</c> — a JSON object
  /// whose <c>type</c> is exactly <c>"boolean"</c> (spec §20.4, R-20.4-c).
  /// </summary>
  /// <param name="value">The candidate property schema.</param>
  /// <returns><c>true</c> when a valid boolean schema.</returns>
  public static bool IsBooleanSchema(JsonNode? value) =>
    AsObject(value) is { } obj && AsString(obj["type"]) == "boolean";

  // ─── EnumSchema family (§20.4) ─────────────────────────────────────────────────

  /// <summary>
  /// The structural classification of an <c>EnumSchema</c>, by its distinguishing keyword (spec §20.4).
  /// </summary>
  public enum EnumSchemaForm
  {
    /// <summary>A string <c>enum</c> with no per-option labels: <c>{ type: "string", enum: [...] }</c>.</summary>
    UntitledSingleSelect,

    /// <summary>A string <c>oneOf</c> of <c>{ const, title }</c> options.</summary>
    TitledSingleSelect,

    /// <summary>An array whose <c>items</c> carry a string <c>enum</c>.</summary>
    UntitledMultiSelect,

    /// <summary>An array whose <c>items</c> carry an <c>anyOf</c> of <c>{ const, title }</c> options.</summary>
    TitledMultiSelect,

    /// <summary>The Deprecated form: a string <c>enum</c> with a parallel <c>enumNames</c> array (spec R-20.4-f).</summary>
    LegacyTitled,
  }

  /// <summary>
  /// Classifies an enum schema into one of its five structural forms by the distinguishing keyword, or
  /// returns <c>null</c> when <paramref name="value"/> is not a well-formed enum schema (spec §20.4).
  /// </summary>
  /// <remarks>
  /// Classification order resolves overlaps:
  /// <list type="bullet">
  ///   <item><c>type: "array"</c> ⇒ multi-select; <c>items.anyOf</c> ⇒ titled, <c>items.enum</c> ⇒ untitled.</item>
  ///   <item><c>type: "string"</c> with <c>oneOf</c> ⇒ titled single-select.</item>
  ///   <item><c>type: "string"</c> with <c>enum</c> + <c>enumNames</c> ⇒ legacy titled.</item>
  ///   <item><c>type: "string"</c> with <c>enum</c> (no <c>enumNames</c>) ⇒ untitled single-select.</item>
  /// </list>
  /// <c>enumNames</c> is the deciding marker for the Deprecated legacy form (R-20.4-f).
  /// </remarks>
  /// <param name="value">The candidate enum schema.</param>
  /// <returns>The classified form, or <c>null</c>.</returns>
  public static EnumSchemaForm? ClassifyEnumSchema(JsonNode? value)
  {
    if (AsObject(value) is not { } obj) return null;
    var type = AsString(obj["type"]);
    if (type == "array")
    {
      if (AsObject(obj["items"]) is not { } items) return null;
      if (HasArray(items, "anyOf")) return EnumSchemaForm.TitledMultiSelect;
      if (HasArray(items, "enum")) return EnumSchemaForm.UntitledMultiSelect;
      return null;
    }
    if (type == "string")
    {
      if (HasArray(obj, "oneOf")) return EnumSchemaForm.TitledSingleSelect;
      if (HasArray(obj, "enum"))
      {
        return HasArray(obj, "enumNames")
          ? EnumSchemaForm.LegacyTitled
          : EnumSchemaForm.UntitledSingleSelect;
      }
    }
    return null;
  }

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a well-formed enum schema in any of its five forms (spec §20.4).</summary>
  /// <param name="value">The candidate enum schema.</param>
  /// <returns><c>true</c> when a valid enum schema.</returns>
  public static bool IsEnumSchema(JsonNode? value) => ClassifyEnumSchema(value) is not null;

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is the Deprecated legacy enum form (a string
  /// <c>enum</c> carrying the non-standard <c>enumNames</c> parallel array). Useful for a conformance
  /// check that new functionality does not adopt it, while a legacy schema received from a peer is still
  /// accepted (spec §20.4, R-20.4-f).
  /// </summary>
  /// <param name="value">The candidate enum schema.</param>
  /// <returns><c>true</c> when the legacy titled form.</returns>
  public static bool IsLegacyTitledEnumSchema(JsonNode? value) =>
    ClassifyEnumSchema(value) == EnumSchemaForm.LegacyTitled;

  // ─── PrimitiveSchemaDefinition union (§20.4) ───────────────────────────────────

  /// <summary>The structural classification of a <c>PrimitiveSchemaDefinition</c> (spec §20.4).</summary>
  public enum PrimitiveSchemaKind
  {
    /// <summary>A free-text string field.</summary>
    String,

    /// <summary>A numeric field (<c>number</c> or <c>integer</c>).</summary>
    Number,

    /// <summary>A boolean field.</summary>
    Boolean,

    /// <summary>An enumerated (single/multi-select) field.</summary>
    Enum,
  }

  /// <summary>
  /// Classifies a property schema by the <c>PrimitiveSchemaDefinition</c> member it selects, or returns
  /// <c>null</c> when it is not a valid primitive schema (spec §20.4). Selection is structural: boolean
  /// by <c>type</c>; number for <c>"number"</c>/<c>"integer"</c>; enum for a string/array schema carrying
  /// <c>enum</c>/<c>oneOf</c>/<c>items</c>; otherwise string for a plain <c>"string"</c>.
  /// </summary>
  /// <param name="value">The candidate property schema.</param>
  /// <returns>The primitive kind, or <c>null</c>.</returns>
  public static PrimitiveSchemaKind? ClassifyPrimitiveSchema(JsonNode? value)
  {
    if (AsObject(value) is not { } obj) return null;
    var type = AsString(obj["type"]);
    switch (type)
    {
      case "boolean":
        return IsBooleanSchema(obj) ? PrimitiveSchemaKind.Boolean : null;
      case "number":
      case "integer":
        return IsNumberSchema(obj) ? PrimitiveSchemaKind.Number : null;
      case "array":
        return ClassifyEnumSchema(obj) is not null ? PrimitiveSchemaKind.Enum : null;
      case "string":
        // A string schema carrying enum/oneOf is an enum member; otherwise free-text.
        if (HasArray(obj, "enum") || HasArray(obj, "oneOf"))
        {
          return ClassifyEnumSchema(obj) is not null ? PrimitiveSchemaKind.Enum : null;
        }
        return IsStringSchema(obj) ? PrimitiveSchemaKind.String : null;
      default:
        return null;
    }
  }

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a valid <c>PrimitiveSchemaDefinition</c> (spec §20.4).</summary>
  /// <param name="value">The candidate property schema.</param>
  /// <returns><c>true</c> when a valid primitive schema.</returns>
  public static bool IsPrimitiveSchemaDefinition(JsonNode? value) => ClassifyPrimitiveSchema(value) is not null;

  // ─── Restricted form schema validation (§20.4) ─────────────────────────────────

  /// <summary>One failure reported by <see cref="ValidateRestrictedFormSchema"/>.</summary>
  /// <param name="Path">A dotted path to the offending node (e.g. <c>properties.age</c>).</param>
  /// <param name="Detail">A human-readable detail.</param>
  public readonly record struct RestrictedFormSchemaError(string Path, string Detail);

  /// <summary>Outcome of <see cref="ValidateRestrictedFormSchema"/>.</summary>
  /// <param name="Valid"><c>true</c> when the schema is a conforming restricted form schema.</param>
  /// <param name="Schema">The validated schema object on success, or <c>null</c>.</param>
  /// <param name="Errors">The accumulated failures (empty when <paramref name="Valid"/> is <c>true</c>).</param>
  public readonly record struct RestrictedFormSchemaValidation(
    bool Valid, JsonObject? Schema, IReadOnlyList<RestrictedFormSchemaError> Errors);

  /// <summary>
  /// Validates the outer structural shape of a <c>requestedSchema</c>: it MUST be a JSON object whose
  /// <c>type</c> is the literal <c>"object"</c>, with a <c>properties</c> object, an OPTIONAL
  /// <c>required</c> string array, and an OPTIONAL <c>$schema</c> string (spec §20.3, R-20.3-e..h). The
  /// per-property primitive check is layered on by <see cref="ValidateRestrictedFormSchema"/>.
  /// </summary>
  private static bool TryValidateOuterShape(
    JsonNode? value, out JsonObject schema, out List<RestrictedFormSchemaError> errors)
  {
    errors = [];
    schema = new JsonObject();
    if (AsObject(value) is not { } obj)
    {
      errors.Add(new RestrictedFormSchemaError("<root>", "requestedSchema MUST be a JSON object."));
      return false;
    }
    if (AsString(obj["type"]) != "object")
    {
      errors.Add(new RestrictedFormSchemaError("type", "requestedSchema.type MUST be the literal \"object\" (R-20.3-e)."));
    }
    if (AsObject(obj["properties"]) is null)
    {
      errors.Add(new RestrictedFormSchemaError("properties", "requestedSchema.properties MUST be an object map (R-20.3-f)."));
    }
    if (obj.TryGetPropertyValue("required", out var req) && req is not null)
    {
      if (AsArray(req) is not { } arr || arr.Any(e => AsString(e) is null))
      {
        errors.Add(new RestrictedFormSchemaError("required", "requestedSchema.required MUST be an array of strings (R-20.3-g)."));
      }
    }
    if (obj.TryGetPropertyValue("$schema", out var dialect) && dialect is not null && AsString(dialect) is null)
    {
      errors.Add(new RestrictedFormSchemaError("$schema", "requestedSchema.$schema MUST be a string when present (R-20.3-h)."));
    }
    schema = obj;
    return errors.Count == 0;
  }

  /// <summary>
  /// Validates a form-mode <c>requestedSchema</c> against the FULL §20.4 restricted form schema: the
  /// outer object shape (<c>type: "object"</c>, a <c>properties</c> map, optional
  /// <c>required</c>/<c>$schema</c>) PLUS the requirement that every property is a valid
  /// <c>PrimitiveSchemaDefinition</c> (spec §20.4, R-20.4-a).
  /// </summary>
  /// <remarks>
  /// This is the §20.4 deepening of the §20.3 structural check, and it owns the full flatness judgement:
  /// the primitive union itself excludes nesting — a nested object (<c>type: "object"</c>), a generic
  /// array-of-objects, a <c>$ref</c>, or a composition keyword on a property fails to match any of the
  /// four members and is rejected. Crucially it ACCEPTS the enum array forms
  /// (<c>oneOf</c>/<c>anyOf</c>/<c>items</c>), the deliberate exceptions §20.4 carves out — they are
  /// matched as <c>EnumSchema</c> members rather than treated as forbidden nesting. Every <c>required</c>
  /// entry must name a declared property.
  /// </remarks>
  /// <param name="value">The candidate <c>requestedSchema</c> object.</param>
  /// <returns>The validation outcome.</returns>
  public static RestrictedFormSchemaValidation ValidateRestrictedFormSchema(JsonNode? value)
  {
    if (!TryValidateOuterShape(value, out var schema, out var errors))
    {
      return new RestrictedFormSchemaValidation(false, null, errors);
    }

    var properties = AsObject(schema["properties"]) ?? new JsonObject();
    foreach (var (name, propSchema) in properties)
    {
      if (ClassifyPrimitiveSchema(propSchema) is null)
      {
        errors.Add(new RestrictedFormSchemaError(
          $"properties.{name}",
          "property schema is not a valid PrimitiveSchemaDefinition (string | number | boolean | enum) (R-20.4-a)"));
      }
    }

    // Every `required` entry MUST name a declared property.
    if (AsArray(schema["required"]) is { } required)
    {
      foreach (var entry in required)
      {
        if (AsString(entry) is { } req && !properties.ContainsKey(req))
        {
          errors.Add(new RestrictedFormSchemaError(
            "required", $"required property \"{req}\" is not declared in properties (R-20.4-a)"));
        }
      }
    }

    return errors.Count == 0
      ? new RestrictedFormSchemaValidation(true, schema, errors)
      : new RestrictedFormSchemaValidation(false, null, errors);
  }

  /// <summary>Returns <c>true</c> when <paramref name="value"/> is a valid restricted form <c>requestedSchema</c> (spec R-20.4-a).</summary>
  /// <param name="value">The candidate <c>requestedSchema</c>.</param>
  /// <returns><c>true</c> when valid.</returns>
  public static bool IsRestrictedFormSchema(JsonNode? value) => ValidateRestrictedFormSchema(value).Valid;

  // ─── Default extraction (§20.4) ────────────────────────────────────────────────

  /// <summary>
  /// Extracts the per-field <c>default</c> values declared in a restricted form schema, so a
  /// defaults-supporting client can pre-populate the corresponding fields (spec §20.4, R-20.4-c).
  /// Returns a map from field name to its declared <c>default</c> node (cloned), including only the
  /// fields that declare one. A client that supports defaults SHOULD use these; one that does not MAY
  /// ignore them.
  /// </summary>
  /// <param name="requestedSchema">A form-mode <c>requestedSchema</c>.</param>
  /// <returns>The field-name → default map (empty when none).</returns>
  public static IReadOnlyDictionary<string, JsonNode?> ExtractDefaults(JsonNode? requestedSchema)
  {
    var output = new Dictionary<string, JsonNode?>(StringComparer.Ordinal);
    if (AsObject(requestedSchema) is not { } schema) return output;
    if (AsObject(schema["properties"]) is not { } properties) return output;
    foreach (var (name, propSchema) in properties)
    {
      if (AsObject(propSchema) is { } prop && prop.TryGetPropertyValue("default", out var def))
      {
        output[name] = def?.DeepClone();
      }
    }
    return output;
  }

  // ─── ElicitResult actions (§20.5) ──────────────────────────────────────────────

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is one of the three defined elicitation actions —
  /// <c>"accept"</c>, <c>"decline"</c>, or <c>"cancel"</c> (spec §20.5, R-20.5-a).
  /// </summary>
  /// <param name="value">The candidate action wire string.</param>
  /// <returns><c>true</c> when a defined action.</returns>
  public static bool IsElicitAction(string? value) =>
    value is "accept" or "decline" or "cancel";

  /// <summary>The wire string of an <see cref="ElicitationAction"/> enum value (spec §20.5, R-20.5-a).</summary>
  /// <param name="action">The action.</param>
  /// <returns>The lower-case wire string.</returns>
  public static string ActionWireValue(ElicitationAction action) => action switch
  {
    ElicitationAction.Accept => "accept",
    ElicitationAction.Decline => "decline",
    ElicitationAction.Cancel => "cancel",
    _ => throw new ArgumentOutOfRangeException(nameof(action)),
  };

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a permitted <c>content</c> VALUE: a string,
  /// number, boolean, or array of strings — the only value types a form-mode <c>content</c> map may
  /// carry (spec §20.5, R-20.5-c). Objects, <c>null</c>, and mixed arrays are rejected.
  /// </summary>
  /// <param name="value">The candidate content value.</param>
  /// <returns><c>true</c> when a permitted value type.</returns>
  public static bool IsElicitContentValue(JsonNode? value)
  {
    switch (value)
    {
      case JsonValue jv:
        var kind = jv.GetValueKind();
        return kind is JsonValueKind.String or JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False;
      case JsonArray arr:
        return arr.All(e => AsString(e) is not null);
      default:
        return false;
    }
  }

  // ─── content ↔ requestedSchema conformance (§20.5) ─────────────────────────────

  /// <summary>One failure reported by <see cref="ValidateElicitContent"/>.</summary>
  /// <param name="Path">The offending field name, or <c>&lt;root&gt;</c> for a top-level shape problem.</param>
  /// <param name="Detail">A human-readable detail.</param>
  public readonly record struct ElicitContentError(string Path, string Detail);

  /// <summary>Outcome of <see cref="ValidateElicitContent"/>.</summary>
  /// <param name="Valid"><c>true</c> when the content conforms to the schema.</param>
  /// <param name="Content">The validated content map on success, or <c>null</c>.</param>
  /// <param name="Errors">The accumulated failures (empty when <paramref name="Valid"/> is <c>true</c>).</param>
  public readonly record struct ElicitContentValidation(
    bool Valid, JsonObject? Content, IReadOnlyList<ElicitContentError> Errors);

  /// <summary>Returns <c>true</c> when <paramref name="node"/> is a JSON number.</summary>
  private static bool IsNumber(JsonNode? node) =>
    node is JsonValue v && v.GetValueKind() == JsonValueKind.Number;

  /// <summary>
  /// Reads a JSON-number node as a <see cref="double"/> robustly, tolerating both parsed JSON and
  /// CLR-backed <see cref="JsonValue"/>s (an <c>int</c>-backed value does not satisfy
  /// <c>TryGetValue&lt;double&gt;</c>, so each numeric CLR type is tried). Returns <c>false</c> for
  /// non-number nodes.
  /// </summary>
  private static bool TryGetDouble(JsonNode? node, out double result)
  {
    result = 0;
    if (node is not JsonValue v || v.GetValueKind() != JsonValueKind.Number) return false;
    if (v.TryGetValue<double>(out var d)) { result = d; return true; }
    if (v.TryGetValue<long>(out var l)) { result = l; return true; }
    if (v.TryGetValue<int>(out var i)) { result = i; return true; }
    if (v.TryGetValue<decimal>(out var m)) { result = (double)m; return true; }
    return false;
  }

  /// <summary>Returns <c>true</c> when <paramref name="node"/> is a JSON integer (a whole number).</summary>
  private static bool IsInteger(JsonNode? node)
  {
    if (node is not JsonValue v || v.GetValueKind() != JsonValueKind.Number) return false;
    if (v.TryGetValue<long>(out _)) return true;
    if (v.TryGetValue<int>(out _)) return true;
    return TryGetDouble(node, out var d) && double.IsFinite(d) && Math.Floor(d) == d;
  }

  /// <summary>Reads a numeric child constraint (e.g. <c>minLength</c>) as a <see cref="double"/>, or <c>null</c> when absent/non-numeric.</summary>
  private static double? NumberConstraint(JsonObject obj, string key) =>
    TryGetDouble(obj[key], out var d) ? d : null;

  /// <summary>Returns <c>true</c> when the <paramref name="value"/> matches the primitive <paramref name="kind"/> of its field schema.</summary>
  private static bool ContentValueMatchesKind(JsonNode? value, PrimitiveSchemaKind kind, JsonObject propSchema)
  {
    switch (kind)
    {
      case PrimitiveSchemaKind.String:
        return AsString(value) is not null;
      case PrimitiveSchemaKind.Number:
        if (!IsNumber(value)) return false;
        // integer schemas additionally require an integer value.
        return AsString(propSchema["type"]) != "integer" || IsInteger(value);
      case PrimitiveSchemaKind.Boolean:
        return value is JsonValue bv && bv.GetValueKind() is JsonValueKind.True or JsonValueKind.False;
      case PrimitiveSchemaKind.Enum:
        var form = ClassifyEnumSchema(propSchema);
        if (form is EnumSchemaForm.UntitledMultiSelect or EnumSchemaForm.TitledMultiSelect)
        {
          return AsArray(value) is { } arr && arr.All(e => AsString(e) is not null);
        }
        return AsString(value) is not null;
      default:
        return false;
    }
  }

  /// <summary>Collects the permitted enum values for an enum field schema (for membership checks), or <c>null</c> when undeterminable.</summary>
  private static HashSet<string>? EnumValuesOf(JsonObject propSchema)
  {
    var form = ClassifyEnumSchema(propSchema);
    switch (form)
    {
      case EnumSchemaForm.UntitledSingleSelect:
      case EnumSchemaForm.LegacyTitled:
        return CollectStrings(AsArray(propSchema["enum"]));
      case EnumSchemaForm.TitledSingleSelect:
        return CollectConsts(AsArray(propSchema["oneOf"]));
      case EnumSchemaForm.UntitledMultiSelect:
        return CollectStrings(AsObject(propSchema["items"]) is { } items ? AsArray(items["enum"]) : null);
      case EnumSchemaForm.TitledMultiSelect:
        return CollectConsts(AsObject(propSchema["items"]) is { } titledItems ? AsArray(titledItems["anyOf"]) : null);
      default:
        return null;
    }
  }

  /// <summary>Collects the string members of an array into a set, or <c>null</c> when the array is absent.</summary>
  private static HashSet<string>? CollectStrings(JsonArray? array)
  {
    if (array is null) return null;
    var set = new HashSet<string>(StringComparer.Ordinal);
    foreach (var element in array)
    {
      if (AsString(element) is { } s) set.Add(s);
    }
    return set;
  }

  /// <summary>Collects the <c>const</c> values of an array of <c>{ const, title }</c> options into a set, or <c>null</c> when absent.</summary>
  private static HashSet<string>? CollectConsts(JsonArray? array)
  {
    if (array is null) return null;
    var set = new HashSet<string>(StringComparer.Ordinal);
    foreach (var element in array)
    {
      if (AsObject(element) is { } o && AsString(o["const"]) is { } c) set.Add(c);
    }
    return set;
  }

  /// <summary>
  /// Validates an accepted form-mode <c>content</c> map against the <c>requestedSchema</c> it answers,
  /// enforcing the §20.5 conformance rule: every value is a string, number, boolean, or array of
  /// strings; every value matches the type/constraints of its field; every <c>required</c> field is
  /// present; and no unknown field appears (spec §20.5, R-20.5-c).
  /// </summary>
  /// <remarks>
  /// Checked per field, by the field's primitive kind:
  /// <list type="bullet">
  ///   <item><c>string</c> — value is a string; honors <c>minLength</c>/<c>maxLength</c>; <c>format</c>
  ///     is a hint and is NOT strictly enforced here.</item>
  ///   <item><c>number</c> — value is a number (and an integer when <c>type: "integer"</c>); honors
  ///     <c>minimum</c>/<c>maximum</c>.</item>
  ///   <item><c>boolean</c> — value is a boolean.</item>
  ///   <item><c>enum</c> — single-select: a string that is one of the permitted values; multi-select: an
  ///     array of strings, each a permitted value, honoring <c>minItems</c>/<c>maxItems</c>.</item>
  /// </list>
  /// Both a client (before sending, R-20.5-i) and a server (on receipt, R-20.5-j) SHOULD run this. The
  /// <paramref name="requestedSchema"/> itself is validated as a restricted form schema first; an
  /// invalid schema yields a single <c>&lt;root&gt;</c> error.
  /// </remarks>
  /// <param name="content">The <c>ElicitResult.content</c> map to validate.</param>
  /// <param name="requestedSchema">The <c>requestedSchema</c> the content answers.</param>
  /// <returns>The validation outcome.</returns>
  public static ElicitContentValidation ValidateElicitContent(JsonNode? content, JsonNode? requestedSchema)
  {
    var schemaValidation = ValidateRestrictedFormSchema(requestedSchema);
    if (!schemaValidation.Valid)
    {
      return new ElicitContentValidation(false, null,
        [new ElicitContentError("<root>", "requestedSchema is not a valid restricted form schema (R-20.4-a)")]);
    }

    if (AsObject(content) is not { } map)
    {
      return new ElicitContentValidation(false, null,
        [new ElicitContentError("<root>", "content MUST be a JSON object map (R-20.5-c)")]);
    }

    var errors = new List<ElicitContentError>();
    // Every value MUST be a permitted content value type (string | number | boolean | string[]).
    foreach (var (key, value) in map)
    {
      if (!IsElicitContentValue(value))
      {
        errors.Add(new ElicitContentError(key, "value is not a permitted content type (string | number | boolean | string[]) (R-20.5-c)"));
      }
    }
    if (errors.Count > 0)
    {
      return new ElicitContentValidation(false, null, errors);
    }

    var schema = schemaValidation.Schema!;
    var properties = AsObject(schema["properties"]) ?? new JsonObject();
    var required = new HashSet<string>(StringComparer.Ordinal);
    if (AsArray(schema["required"]) is { } reqArr)
    {
      foreach (var element in reqArr)
      {
        if (AsString(element) is { } s) required.Add(s);
      }
    }

    // No unknown fields.
    foreach (var (key, _) in map)
    {
      if (!properties.ContainsKey(key))
      {
        errors.Add(new ElicitContentError(key, $"field \"{key}\" is not declared in requestedSchema (R-20.5-c)"));
      }
    }

    // Every required field present.
    foreach (var req in required)
    {
      if (!map.ContainsKey(req))
      {
        errors.Add(new ElicitContentError(req, $"required field \"{req}\" is missing (R-20.5-c)"));
      }
    }

    // Per-field type and constraint conformance.
    foreach (var (name, propSchemaNode) in properties)
    {
      if (!map.TryGetPropertyValue(name, out var value)) continue;
      if (AsObject(propSchemaNode) is not { } propSchema) continue;
      var kind = ClassifyPrimitiveSchema(propSchema);
      if (kind is null) continue; // schema-level problem already excluded above

      if (!ContentValueMatchesKind(value, kind.Value, propSchema))
      {
        errors.Add(new ElicitContentError(name, $"value does not match the {kind.Value.ToString().ToLowerInvariant()} field schema (R-20.5-c)"));
        continue;
      }

      switch (kind.Value)
      {
        case PrimitiveSchemaKind.String when AsString(value) is { } str:
          var minLen = NumberConstraint(propSchema, "minLength");
          var maxLen = NumberConstraint(propSchema, "maxLength");
          if (minLen is { } mn && str.Length < mn)
          {
            errors.Add(new ElicitContentError(name, $"string shorter than minLength {Format(mn)} (R-20.5-c)"));
          }
          if (maxLen is { } mx && str.Length > mx)
          {
            errors.Add(new ElicitContentError(name, $"string longer than maxLength {Format(mx)} (R-20.5-c)"));
          }
          break;

        case PrimitiveSchemaKind.Number when TryGetDouble(value, out var num):
          var minimum = NumberConstraint(propSchema, "minimum");
          var maximum = NumberConstraint(propSchema, "maximum");
          if (minimum is { } lo && num < lo)
          {
            errors.Add(new ElicitContentError(name, $"number below minimum {Format(lo)} (R-20.5-c)"));
          }
          if (maximum is { } hi && num > hi)
          {
            errors.Add(new ElicitContentError(name, $"number above maximum {Format(hi)} (R-20.5-c)"));
          }
          break;

        case PrimitiveSchemaKind.Enum:
          var allowed = EnumValuesOf(propSchema);
          List<string> values = AsArray(value) is { } arr
            ? arr.Select(AsString).Where(s => s is not null).Select(s => s!).ToList()
            : AsString(value) is { } single ? [single] : [];
          if (allowed is not null)
          {
            foreach (var v in values)
            {
              if (!allowed.Contains(v))
              {
                errors.Add(new ElicitContentError(name, $"value \"{v}\" is not one of the permitted enum values (R-20.5-c)"));
              }
            }
          }
          var form = ClassifyEnumSchema(propSchema);
          if (form is EnumSchemaForm.UntitledMultiSelect or EnumSchemaForm.TitledMultiSelect && AsArray(value) is { } selections)
          {
            var minItems = NumberConstraint(propSchema, "minItems");
            var maxItems = NumberConstraint(propSchema, "maxItems");
            if (minItems is { } minI && selections.Count < minI)
            {
              errors.Add(new ElicitContentError(name, $"fewer than minItems {Format(minI)} selections (R-20.5-c)"));
            }
            if (maxItems is { } maxI && selections.Count > maxI)
            {
              errors.Add(new ElicitContentError(name, $"more than maxItems {Format(maxI)} selections (R-20.5-c)"));
            }
          }
          break;
      }
    }

    return errors.Count == 0
      ? new ElicitContentValidation(true, map, errors)
      : new ElicitContentValidation(false, null, errors);
  }

  /// <summary>Formats a constraint number without a trailing <c>.0</c> for integral values, matching JS number rendering.</summary>
  private static string Format(double value) =>
    value == Math.Floor(value) && double.IsFinite(value)
      ? ((long)value).ToString(System.Globalization.CultureInfo.InvariantCulture)
      : value.ToString(System.Globalization.CultureInfo.InvariantCulture);

  // ─── ElicitResult validation (§20.5) ───────────────────────────────────────────

  /// <summary>One failure reported by <see cref="ValidateElicitResult"/>.</summary>
  /// <param name="Path">A dotted path to the offending node.</param>
  /// <param name="Detail">A human-readable detail.</param>
  public readonly record struct ElicitResultError(string Path, string Detail);

  /// <summary>Outcome of <see cref="ValidateElicitResult"/>.</summary>
  /// <param name="Valid"><c>true</c> when the result conforms to the §20.5 action/content rules.</param>
  /// <param name="Result">The validated result on success, or <c>null</c>.</param>
  /// <param name="Errors">The accumulated failures (empty when <paramref name="Valid"/> is <c>true</c>).</param>
  public readonly record struct ElicitResultValidation(
    bool Valid, ElicitResult? Result, IReadOnlyList<ElicitResultError> Errors);

  /// <summary>
  /// Validates a returned <c>ElicitResult</c> against the §20.5 action/content rules for the mode it
  /// answers (spec §20.5, R-20.5-a, R-20.5-b, R-20.5-c).
  /// </summary>
  /// <remarks>
  /// Enforced:
  /// <list type="bullet">
  ///   <item><c>action</c> is REQUIRED and exactly one of <c>accept</c>/<c>decline</c>/<c>cancel</c>;</item>
  ///   <item><c>content</c> is permitted ONLY when <c>action == "accept"</c> AND the mode is form; a
  ///     URL-mode accept, a decline, or a cancel carrying <c>content</c> is malformed (the URL-mode
  ///     case is a credential-leak vector);</item>
  ///   <item>when <c>content</c> is present (form-mode accept), it conforms to
  ///     <paramref name="requestedSchema"/> per <see cref="ValidateElicitContent"/> — supply the schema
  ///     to enable this check.</item>
  /// </list>
  /// Content values are additionally checked to be the permitted types (string | number | boolean |
  /// string[]); a disallowed type (object, null, mixed array) makes the result malformed.
  /// </remarks>
  /// <param name="result">The <c>ElicitResult</c> returned by the client.</param>
  /// <param name="mode">The mode of the originating request (<c>"form"</c> or <c>"url"</c>).</param>
  /// <param name="requestedSchema">The form-mode <c>requestedSchema</c> (used only to check <c>content</c> conformance on a form-mode accept).</param>
  /// <returns>The validation outcome.</returns>
  public static ElicitResultValidation ValidateElicitResult(
    ElicitResult? result, string mode, JsonNode? requestedSchema = null)
  {
    if (result is null)
    {
      return new ElicitResultValidation(false, null,
        [new ElicitResultError("<root>", "ElicitResult MUST be present (R-20.5-a)")]);
    }

    var errors = new List<ElicitResultError>();
    var content = result.Content;
    var hasContent = content is not null;

    // The strict schema additionally rejects a content value of a disallowed type.
    if (hasContent)
    {
      foreach (var (key, value) in content!)
      {
        if (!IsElicitContentValue(value))
        {
          errors.Add(new ElicitResultError($"content.{key}", "content value is not a permitted type (string | number | boolean | string[]) (R-20.5-c)"));
        }
      }
    }

    if (errors.Count > 0)
    {
      return new ElicitResultValidation(false, null, errors);
    }

    if (hasContent)
    {
      if (result.Action != ElicitationAction.Accept)
      {
        errors.Add(new ElicitResultError("content",
          $"content is only permitted on an \"accept\" action; got \"{ActionWireValue(result.Action)}\" (R-20.5-b)"));
      }
      else if (string.Equals(mode, "url", StringComparison.Ordinal))
      {
        errors.Add(new ElicitResultError("content", "content MUST be omitted for a URL-mode response (R-20.5-b)"));
      }
      else if (requestedSchema is not null)
      {
        var contentValidation = ValidateElicitContent(content, requestedSchema);
        if (!contentValidation.Valid)
        {
          foreach (var e in contentValidation.Errors)
          {
            errors.Add(new ElicitResultError($"content.{e.Path}", e.Detail));
          }
        }
      }
    }

    return errors.Count == 0
      ? new ElicitResultValidation(true, result, errors)
      : new ElicitResultValidation(false, null, errors);
  }

  // ─── Server action handling (§20.5) ────────────────────────────────────────────

  /// <summary>A structured directive for how a server should react to an <c>ElicitResult</c> (spec §20.5).</summary>
  public enum ElicitActionHandling
  {
    /// <summary>form-mode accept with conforming <c>content</c>; the server SHOULD process it (R-20.5-d).</summary>
    ProcessFormData,

    /// <summary>url-mode accept: consent given, NOT completion; await the §20.6 notification (R-20.5-d).</summary>
    AwaitUrlCompletion,

    /// <summary>explicit decline; the server SHOULD offer alternatives (R-20.5-e).</summary>
    Declined,

    /// <summary>dismissal; the server SHOULD prompt again later (R-20.5-f).</summary>
    Cancelled,

    /// <summary>the result was malformed for its mode; treat as a failure to process — never success (R-20.5-g, R-20.5-h).</summary>
    Malformed,
  }

  /// <summary>Outcome of <see cref="ResolveElicitActionOutcome"/>.</summary>
  /// <param name="Handle">The server's handling directive.</param>
  /// <param name="Content">The conforming form-mode <c>content</c> when <see cref="ElicitActionHandling.ProcessFormData"/>; otherwise <c>null</c>.</param>
  /// <param name="Errors">The validation failures when <see cref="ElicitActionHandling.Malformed"/> (empty otherwise).</param>
  public readonly record struct ElicitActionOutcome(
    ElicitActionHandling Handle, JsonObject? Content, IReadOnlyList<ElicitResultError> Errors);

  /// <summary>
  /// Maps a returned <c>ElicitResult</c> to the server's handling directive, encoding the §20.5 rule
  /// that a server MUST NOT assume success and MUST handle decline, cancel, and a client failure to
  /// process (spec §20.5, R-20.5-d … R-20.5-h). The returned <see cref="ElicitActionOutcome.Handle"/>
  /// gives the server an explicit branch for every action — including <c>malformed</c> (the client's
  /// answer did not conform), which is treated as a failure to process, never as success.
  /// </summary>
  /// <param name="result">The <c>ElicitResult</c> returned by the client.</param>
  /// <param name="mode">The mode of the originating request.</param>
  /// <param name="requestedSchema">The form-mode <c>requestedSchema</c> (for content checks).</param>
  /// <returns>The handling directive.</returns>
  public static ElicitActionOutcome ResolveElicitActionOutcome(
    ElicitResult? result, string mode, JsonNode? requestedSchema = null)
  {
    var validation = ValidateElicitResult(result, mode, requestedSchema);
    if (!validation.Valid)
    {
      return new ElicitActionOutcome(ElicitActionHandling.Malformed, null, validation.Errors);
    }
    var validated = validation.Result!;
    if (validated.Action == ElicitationAction.Decline)
    {
      return new ElicitActionOutcome(ElicitActionHandling.Declined, null, []);
    }
    if (validated.Action == ElicitationAction.Cancel)
    {
      return new ElicitActionOutcome(ElicitActionHandling.Cancelled, null, []);
    }
    // accept:
    if (string.Equals(mode, "url", StringComparison.Ordinal))
    {
      return new ElicitActionOutcome(ElicitActionHandling.AwaitUrlCompletion, null, []);
    }
    return new ElicitActionOutcome(ElicitActionHandling.ProcessFormData, validated.Content ?? new JsonObject(), []);
  }

  // ─── Builders for ElicitResult (§20.5) ─────────────────────────────────────────

  /// <summary>
  /// Builds a form-mode <c>accept</c> <see cref="ElicitResult"/> carrying validated <c>content</c> (spec
  /// §20.5, R-20.5-c, R-20.5-i). Validates <c>content</c> against <paramref name="requestedSchema"/>
  /// before building (the client-side pre-send check), so a malformed submission is rejected rather than
  /// sent.
  /// </summary>
  /// <param name="content">The collected field values.</param>
  /// <param name="requestedSchema">The <c>requestedSchema</c> the content answers.</param>
  /// <returns>The <c>accept</c> result.</returns>
  /// <exception cref="ArgumentException">When <paramref name="content"/> does not conform to the schema.</exception>
  public static ElicitResult BuildAcceptResult(JsonObject content, JsonNode? requestedSchema)
  {
    ArgumentNullException.ThrowIfNull(content);
    var validation = ValidateElicitContent(content, requestedSchema);
    if (!validation.Valid)
    {
      var detail = string.Join("; ", validation.Errors.Select(e => $"{e.Path}: {e.Detail}"));
      throw new ArgumentException($"Invalid elicitation content: {detail}", nameof(content));
    }
    return new ElicitResult { Action = ElicitationAction.Accept, Content = validation.Content };
  }

  /// <summary>
  /// Builds a URL-mode <c>accept</c> <see cref="ElicitResult"/> — consent to the out-of-band
  /// interaction, carrying NO <c>content</c> (spec §20.5, R-20.5-b).
  /// </summary>
  /// <returns>The URL-mode <c>accept</c> result.</returns>
  public static ElicitResult BuildUrlAcceptResult() => new() { Action = ElicitationAction.Accept };

  /// <summary>Builds a <c>decline</c> <see cref="ElicitResult"/> (no <c>content</c>) (spec §20.5).</summary>
  /// <returns>The <c>decline</c> result.</returns>
  public static ElicitResult BuildDeclineResult() => new() { Action = ElicitationAction.Decline };

  /// <summary>Builds a <c>cancel</c> <see cref="ElicitResult"/> (no <c>content</c>) (spec §20.5).</summary>
  /// <returns>The <c>cancel</c> result.</returns>
  public static ElicitResult BuildCancelResult() => new() { Action = ElicitationAction.Cancel };

  // ─── Elicitation-complete notification (§20.6) ─────────────────────────────────

  /// <summary>The exact method literal of the URL-mode out-of-band completion notification (spec §20.6, R-20.6-a).</summary>
  public const string ElicitationCompleteNotificationMethod = "notifications/elicitation/complete";

  /// <summary>
  /// Returns <c>true</c> when <paramref name="value"/> is a well-formed
  /// <c>notifications/elicitation/complete</c> JSON-RPC notification: <c>jsonrpc: "2.0"</c>, the exact
  /// method literal, and <c>params</c> carrying a non-empty <c>elicitationId</c> string (spec §20.6,
  /// R-20.6-a, R-20.6-b).
  /// </summary>
  /// <param name="value">The raw notification node.</param>
  /// <returns><c>true</c> when well-formed.</returns>
  public static bool IsElicitationCompleteNotification(JsonNode? value)
  {
    if (AsObject(value) is not { } obj) return false;
    if (AsString(obj["jsonrpc"]) != "2.0") return false;
    if (AsString(obj["method"]) != ElicitationCompleteNotificationMethod) return false;
    if (AsObject(obj["params"]) is not { } prms) return false;
    return AsString(prms["elicitationId"]) is { Length: > 0 };
  }

  /// <summary>
  /// Builds a <c>notifications/elicitation/complete</c> notification for <paramref name="elicitationId"/>
  /// as a raw JSON-RPC notification object (spec §20.6, R-20.6-a, R-20.6-b). The caller (the server)
  /// MUST send the result only to the client that initiated the elicitation (R-20.6-c) — a
  /// transport-level concern this builder cannot enforce; it ensures the <c>elicitationId</c> is carried
  /// verbatim.
  /// </summary>
  /// <param name="elicitationId">The id of the elicitation that completed; MUST be non-empty.</param>
  /// <returns>The notification JSON object.</returns>
  /// <exception cref="ArgumentException">When <paramref name="elicitationId"/> is empty (R-20.6-b).</exception>
  public static JsonObject BuildElicitationCompleteNotification(string elicitationId)
  {
    if (string.IsNullOrEmpty(elicitationId))
    {
      throw new ArgumentException("elicitation-complete notification requires a non-empty elicitationId (R-20.6-b)", nameof(elicitationId));
    }
    return new JsonObject
    {
      ["jsonrpc"] = "2.0",
      ["method"] = ElicitationCompleteNotificationMethod,
      ["params"] = new JsonObject { ["elicitationId"] = elicitationId },
    };
  }

  /// <summary>The state of an elicitation as tracked by a client awaiting URL-mode completion (spec §20.6).</summary>
  public enum ElicitationLifecycleState
  {
    /// <summary>The elicitation is in-flight; a completion notification is still expected.</summary>
    Pending,

    /// <summary>The elicitation has already completed.</summary>
    Completed,
  }

  /// <summary>How a client should react to an incoming completion notification (spec §20.6).</summary>
  public enum ElicitationCompleteAction
  {
    /// <summary>An unknown or already-completed id ⇒ MUST ignore, take no action (R-20.6-d).</summary>
    Ignore,

    /// <summary>A pending id just completed ⇒ MAY auto-retry / update UI / continue (R-20.6-e).</summary>
    Complete,
  }

  /// <summary>The reason a completion notification is ignored (spec §20.6, R-20.6-d).</summary>
  public enum ElicitationCompleteIgnoreReason
  {
    /// <summary>No reason (the notification is being acted on).</summary>
    None,

    /// <summary>The <c>elicitationId</c> is not known to this client.</summary>
    UnknownId,

    /// <summary>The <c>elicitationId</c> has already completed.</summary>
    AlreadyCompleted,
  }

  /// <summary>Outcome of <see cref="HandleElicitationComplete"/>.</summary>
  /// <param name="Action">What the client should do.</param>
  /// <param name="Reason">The ignore reason when <paramref name="Action"/> is <see cref="ElicitationCompleteAction.Ignore"/>.</param>
  /// <param name="ElicitationId">The completed id when <paramref name="Action"/> is <see cref="ElicitationCompleteAction.Complete"/>; otherwise <c>null</c>.</param>
  public readonly record struct ElicitationCompleteHandling(
    ElicitationCompleteAction Action, ElicitationCompleteIgnoreReason Reason, string? ElicitationId);

  /// <summary>
  /// Decides how a client should react to an incoming elicitation-complete notification, enforcing the
  /// §20.6 ignore rule (spec §20.6, R-20.6-d, R-20.6-e). A client MUST ignore a notification whose
  /// <c>elicitationId</c> is unknown or already completed (R-20.6-d); for a still-pending id it MAY
  /// proceed to auto-retry, update its UI, or otherwise continue (R-20.6-e). Independently, a client
  /// SHOULD provide manual retry/cancel controls in case it never arrives (R-20.6-f) — a UI concern
  /// outside this pure decision.
  /// </summary>
  /// <param name="notification">The received notification (validated here).</param>
  /// <param name="known">Map of <c>elicitationId</c> → tracked lifecycle state for the in-flight URL-mode elicitations this client initiated.</param>
  /// <returns>The handling directive.</returns>
  public static ElicitationCompleteHandling HandleElicitationComplete(
    JsonNode? notification, IReadOnlyDictionary<string, ElicitationLifecycleState> known)
  {
    ArgumentNullException.ThrowIfNull(known);
    if (!IsElicitationCompleteNotification(notification))
    {
      return new ElicitationCompleteHandling(ElicitationCompleteAction.Ignore, ElicitationCompleteIgnoreReason.UnknownId, null);
    }
    var id = AsString(AsObject(((JsonObject)notification!)["params"])!["elicitationId"])!;
    if (!known.TryGetValue(id, out var state))
    {
      return new ElicitationCompleteHandling(ElicitationCompleteAction.Ignore, ElicitationCompleteIgnoreReason.UnknownId, null);
    }
    if (state == ElicitationLifecycleState.Completed)
    {
      return new ElicitationCompleteHandling(ElicitationCompleteAction.Ignore, ElicitationCompleteIgnoreReason.AlreadyCompleted, null);
    }
    return new ElicitationCompleteHandling(ElicitationCompleteAction.Complete, ElicitationCompleteIgnoreReason.None, id);
  }

  // ─── Sensitive information & form-vs-URL mode (§20.7) ───────────────────────────

  /// <summary>
  /// Heuristic markers for sensitive credential fields a server MUST NOT request via form mode
  /// (passwords, API keys, access tokens, payment credentials). Matched against a lower-cased field name
  /// / <c>title</c> / <c>description</c> (spec §20.7, R-20.7-h). This is a best-effort guard, not an
  /// exhaustive list; servers remain responsible for routing sensitive interactions to URL mode
  /// (R-20.7-i).
  /// </summary>
  public static IReadOnlyList<string> SensitiveFieldMarkers { get; } =
  [
    "password",
    "passwd",
    "secret",
    "api key",
    "apikey",
    "api-key",
    "access token",
    "access_token",
    "accesstoken",
    "token",
    "credential",
    "private key",
    "card number",
    "cardnumber",
    "cvv",
    "cvc",
    "ssn",
    "payment",
  ];

  /// <summary>Returns <c>true</c> when <paramref name="text"/> contains a marker suggesting sensitive credential data (spec R-20.7-h).</summary>
  private static bool LooksSensitive(string? text)
  {
    if (text is null) return false;
    var hay = text.ToLowerInvariant();
    return SensitiveFieldMarkers.Any(m => hay.Contains(m, StringComparison.Ordinal));
  }

  /// <summary>
  /// Inspects a form-mode <c>requestedSchema</c> for fields that appear to request sensitive credential
  /// data, which a server MUST NOT collect via form mode (and MUST instead route through URL mode) (spec
  /// §20.7, R-20.7-h, R-20.7-i). Returns the list of field names whose name / <c>title</c> /
  /// <c>description</c> matches a sensitive marker. An empty list means none were detected — general
  /// contact/profile data (name, email, username) is NOT categorically prohibited and is not flagged.
  /// </summary>
  /// <param name="requestedSchema">A form-mode <c>requestedSchema</c>.</param>
  /// <returns>The flagged field names (empty when none).</returns>
  public static IReadOnlyList<string> FindSensitiveFormFields(JsonNode? requestedSchema)
  {
    var flagged = new List<string>();
    if (AsObject(requestedSchema) is not { } schema) return flagged;
    if (AsObject(schema["properties"]) is not { } properties) return flagged;
    foreach (var (name, propSchema) in properties)
    {
      var fields = new List<string> { name };
      if (AsObject(propSchema) is { } prop)
      {
        // Collect only present strings — an absent title/description contributes nothing, so there is
        // no need for an empty-string sentinel (which LooksSensitive would never flag anyway).
        if (AsString(prop["title"]) is { } title) fields.Add(title);
        if (AsString(prop["description"]) is { } description) fields.Add(description);
      }
      if (fields.Any(LooksSensitive)) flagged.Add(name);
    }
    return flagged;
  }

  /// <summary>Outcome of <see cref="AssertFormModeMayCollect"/>.</summary>
  /// <param name="Ok"><c>true</c> when no sensitive fields were detected.</param>
  /// <param name="SensitiveFields">The flagged field names when <paramref name="Ok"/> is <c>false</c> (empty otherwise).</param>
  public readonly record struct SensitiveFieldCheck(bool Ok, IReadOnlyList<string> SensitiveFields);

  /// <summary>
  /// Asserts that a form-mode <c>requestedSchema</c> does not request sensitive credential data — the
  /// §20.7 prohibition (spec §20.7, R-20.7-h, R-20.7-i). Returns <c>Ok</c> when no sensitive fields are
  /// detected, otherwise names the offending fields; the server MUST then use URL mode for those
  /// interactions instead (R-20.7-i).
  /// </summary>
  /// <param name="requestedSchema">A form-mode <c>requestedSchema</c>.</param>
  /// <returns>The check outcome.</returns>
  public static SensitiveFieldCheck AssertFormModeMayCollect(JsonNode? requestedSchema)
  {
    var sensitive = FindSensitiveFormFields(requestedSchema);
    return sensitive.Count == 0
      ? new SensitiveFieldCheck(true, [])
      : new SensitiveFieldCheck(false, sensitive);
  }

  // ─── Safe URL construction & handling (§20.7) ──────────────────────────────────

  /// <summary>One reason an elicitation URL is unsafe, per the §20.7 server construction rules.</summary>
  public enum UnsafeUrlReason
  {
    /// <summary>Not a valid absolute URL.</summary>
    InvalidUrl,

    /// <summary>Carries apparent end-user PII / credentials in the URL (R-20.7-p).</summary>
    ContainsSensitiveInfo,

    /// <summary>Appears pre-authenticated to a protected resource (R-20.7-q).</summary>
    PreAuthenticated,

    /// <summary>Uses a non-HTTPS scheme outside development (R-20.7-s).</summary>
    InsecureScheme,
  }

  /// <summary>A single unsafe-URL finding.</summary>
  /// <param name="Reason">Why the URL is unsafe.</param>
  /// <param name="Detail">A human-readable detail, or <c>null</c> for <see cref="UnsafeUrlReason.InvalidUrl"/>.</param>
  public readonly record struct UnsafeUrlFinding(UnsafeUrlReason Reason, string? Detail);

  /// <summary>Outcome of <see cref="CheckElicitationUrlSafety"/>.</summary>
  /// <param name="Safe"><c>true</c> when the URL passed every §20.7 safe-construction check.</param>
  /// <param name="Reasons">The findings when <paramref name="Safe"/> is <c>false</c> (empty otherwise).</param>
  public readonly record struct ElicitationUrlSafety(bool Safe, IReadOnlyList<UnsafeUrlFinding> Reasons);

  /// <summary>Query/credential markers that suggest sensitive info or pre-authentication in a URL (spec §20.7).</summary>
  private static readonly string[] UrlSensitiveParamMarkers =
  [
    "password",
    "secret",
    "token",
    "access_token",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "session",
    "sessionid",
    "credential",
    "ssn",
    "card",
  ];

  /// <summary>
  /// Checks a server-constructed elicitation URL against the §20.7 safe-construction rules: it MUST NOT
  /// carry sensitive end-user info, MUST NOT be pre-authenticated to a protected resource, and SHOULD
  /// use HTTPS outside development (spec §20.7, R-20.7-p, R-20.7-q, R-20.7-s).
  /// </summary>
  /// <remarks>
  /// Heuristics flag credential/PII-looking query parameters and embedded userinfo (<c>user:pass@host</c>),
  /// and (outside <paramref name="allowInsecure"/>) any non-<c>https:</c> scheme. This is a guard to
  /// catch obvious mistakes, not a guarantee of safety.
  /// </remarks>
  /// <param name="url">The elicitation URL the server intends to send.</param>
  /// <param name="allowInsecure"><c>true</c> permits non-HTTPS (development only).</param>
  /// <returns>The safety outcome.</returns>
  public static ElicitationUrlSafety CheckElicitationUrlSafety(string? url, bool allowInsecure = false)
  {
    if (!TryParseWhatwgUrl(url, out var parsed))
    {
      return new ElicitationUrlSafety(false, [new UnsafeUrlFinding(UnsafeUrlReason.InvalidUrl, null)]);
    }

    var reasons = new List<UnsafeUrlFinding>();

    // Embedded credentials (`user:pass@host`) ⇒ pre-authenticated / sensitive.
    if (!string.IsNullOrEmpty(parsed.UserInfo))
    {
      reasons.Add(new UnsafeUrlFinding(UnsafeUrlReason.PreAuthenticated,
        "URL embeds userinfo credentials (user:pass@host) (R-20.7-q)"));
    }

    // Credential/PII-looking query parameters.
    var flaggedParams = new List<string>();
    foreach (var key in ParseQueryKeys(parsed.Query))
    {
      var lower = key.ToLowerInvariant();
      if (UrlSensitiveParamMarkers.Any(m => lower.Contains(m, StringComparison.Ordinal)))
      {
        flaggedParams.Add(key);
      }
    }
    if (flaggedParams.Count > 0)
    {
      reasons.Add(new UnsafeUrlFinding(UnsafeUrlReason.ContainsSensitiveInfo,
        $"query parameters look sensitive: {string.Join(", ", flaggedParams)} (R-20.7-p, R-20.7-q)"));
    }

    // HTTPS outside development.
    if (!allowInsecure && !string.Equals(parsed.Scheme, "https", StringComparison.Ordinal))
    {
      reasons.Add(new UnsafeUrlFinding(UnsafeUrlReason.InsecureScheme,
        $"scheme \"{parsed.Scheme}:\" is not https (R-20.7-s)"));
    }

    return reasons.Count == 0
      ? new ElicitationUrlSafety(true, [])
      : new ElicitationUrlSafety(false, reasons);
  }

  /// <summary>Parses the keys of a URL query string (e.g. <c>?a=1&amp;b=2</c>), preserving the original casing.</summary>
  private static IEnumerable<string> ParseQueryKeys(string query)
  {
    if (string.IsNullOrEmpty(query)) yield break;
    var trimmed = query.StartsWith('?') ? query[1..] : query;
    foreach (var pair in trimmed.Split('&', StringSplitOptions.RemoveEmptyEntries))
    {
      var eq = pair.IndexOf('=');
      yield return eq < 0 ? Uri.UnescapeDataString(pair) : Uri.UnescapeDataString(pair[..eq]);
    }
  }

  /// <summary>What a client must surface to the user before consenting to open a URL (spec §20.7).</summary>
  /// <param name="FullUrl">The full URL shown verbatim for examination (R-20.7-v).</param>
  /// <param name="Host">The host to highlight (mitigates subdomain spoofing) (R-20.7-v, R-20.7-x).</param>
  /// <param name="Domain">The registrable-ish domain portion highlighted to the user (R-20.7-x).</param>
  /// <param name="Scheme">The URL scheme.</param>
  /// <param name="ContainsPunycode"><c>true</c> when the host contains Punycode (<c>xn--</c>) — warn the user (R-20.7-x).</param>
  /// <param name="Warnings">Warnings to display about ambiguous/suspicious aspects of the URL (R-20.7-x).</param>
  public readonly record struct UrlConsentPresentation(
    string FullUrl, string Host, string Domain, string Scheme, bool ContainsPunycode, IReadOnlyList<string> Warnings);

  /// <summary>
  /// Builds the consent-presentation data a client MUST show before opening a URL-mode elicitation URL:
  /// the full URL and a clearly-highlighted target host, plus warnings about Punycode / ambiguous URIs
  /// (spec §20.7, R-20.7-v, R-20.7-x).
  /// </summary>
  /// <remarks>
  /// This produces the data a UI binds to; it does NOT open the URL or prefetch it (a client MUST NOT
  /// prefetch — R-20.7-t — and MUST NOT open without consent — R-20.7-u). The host is exposed separately
  /// so the UI can highlight it to defend against subdomain spoofing, and a Punycode host raises a
  /// warning.
  /// </remarks>
  /// <param name="url">The URL-mode elicitation URL.</param>
  /// <returns>The consent presentation.</returns>
  /// <exception cref="ArgumentException">When <paramref name="url"/> is not a valid absolute URL.</exception>
  public static UrlConsentPresentation BuildUrlConsentPresentation(string url)
  {
    if (!TryParseWhatwgUrl(url, out var parsed))
    {
      throw new ArgumentException($"Cannot present an invalid elicitation URL for consent: \"{url}\"", nameof(url));
    }
    var host = parsed.Host;
    var labels = host.Split('.');
    var domain = labels.Length >= 2 ? string.Join('.', labels[^2..]) : host;
    var containsPunycode = host.ToLowerInvariant().Split('.').Any(label => label.StartsWith("xn--", StringComparison.Ordinal));

    var warnings = new List<string>();
    if (containsPunycode)
    {
      warnings.Add("Host contains Punycode (xn--); the displayed name may differ from the real domain.");
    }
    if (!string.IsNullOrEmpty(parsed.UserInfo))
    {
      warnings.Add("URL embeds credentials in its userinfo; treat with suspicion.");
    }
    if (!string.Equals(parsed.Scheme, "https", StringComparison.Ordinal))
    {
      warnings.Add($"URL uses a non-HTTPS scheme ({parsed.Scheme}:).");
    }

    return new UrlConsentPresentation(parsed.AbsoluteUri, host, domain, parsed.Scheme, containsPunycode, warnings);
  }

  /// <summary>
  /// Returns <c>true</c> when a URL MAY be rendered as a clickable link for the given field, enforcing
  /// the §20.7 rule that ONLY the <c>url</c> field of a URL-mode request is clickable; no other field of
  /// any elicitation request may be (spec §20.7, R-20.7-r, R-20.7-y).
  /// </summary>
  /// <param name="fieldName">The field the URL would be rendered in.</param>
  /// <param name="mode">The mode of the elicitation request.</param>
  /// <returns><c>true</c> when the URL may be clickable.</returns>
  public static bool MayRenderUrlClickable(string fieldName, string mode) =>
    string.Equals(mode, "url", StringComparison.Ordinal) && string.Equals(fieldName, "url", StringComparison.Ordinal);

  // ─── Server-side identity binding & verification (§20.7) ───────────────────────

  /// <summary>The reason a URL-mode user-binding check fails (spec §20.7).</summary>
  public enum UserBindingFailure
  {
    /// <summary>No failure (success).</summary>
    None,

    /// <summary>The two sessions resolve to different subjects ⇒ reject (R-20.7-m).</summary>
    SubjectMismatch,

    /// <summary>A subject was missing or client-provided-only ⇒ cannot verify (R-20.7-j, R-20.7-k).</summary>
    UnverifiedIdentity,
  }

  /// <summary>Outcome of <see cref="VerifyElicitationUserBinding"/>.</summary>
  /// <param name="Ok"><c>true</c> when both sessions resolve to the same server-verified subject.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="Expected">The MCP-session subject on a <see cref="UserBindingFailure.SubjectMismatch"/>; otherwise <c>null</c>.</param>
  /// <param name="Actual">The browser-session subject on a <see cref="UserBindingFailure.SubjectMismatch"/>; otherwise <c>null</c>.</param>
  /// <param name="Detail">A human-readable detail on an <see cref="UserBindingFailure.UnverifiedIdentity"/>; otherwise <c>null</c>.</param>
  public readonly record struct ElicitationUserBindingResult(
    bool Ok, UserBindingFailure Reason, string? Expected, string? Actual, string? Detail);

  /// <summary>
  /// Verifies, for a URL-mode elicitation, that the user who opened the URL is the same user who started
  /// the elicitation — the §20.7 cross-user anti-phishing check (spec §20.7, R-20.7-j … R-20.7-o).
  /// </summary>
  /// <remarks>
  /// The server MUST compare server-side-verified subjects (e.g. the authoritative <c>sub</c> of the MCP
  /// session vs the <c>sub</c> of the browser session that opened the URL), NOT any identity carried in
  /// the URL (R-20.7-n, R-20.7-o); both inputs here are expected to be authoritative subjects the caller
  /// resolved through its authorization server. A missing/empty subject yields
  /// <see cref="UserBindingFailure.UnverifiedIdentity"/> (R-20.7-k); differing subjects yield
  /// <see cref="UserBindingFailure.SubjectMismatch"/> (R-20.7-m).
  /// </remarks>
  /// <param name="mcpSessionSubject">Authoritative <c>sub</c> of the MCP session that started the elicitation.</param>
  /// <param name="browserSessionSubject">Authoritative <c>sub</c> of the browser session that opened the elicitation URL.</param>
  /// <returns>The binding outcome.</returns>
  public static ElicitationUserBindingResult VerifyElicitationUserBinding(
    string? mcpSessionSubject, string? browserSessionSubject)
  {
    if (string.IsNullOrEmpty(mcpSessionSubject))
    {
      return new ElicitationUserBindingResult(false, UserBindingFailure.UnverifiedIdentity, null, null,
        "missing server-verified MCP-session subject (R-20.7-j, R-20.7-k)");
    }
    if (string.IsNullOrEmpty(browserSessionSubject))
    {
      return new ElicitationUserBindingResult(false, UserBindingFailure.UnverifiedIdentity, null, null,
        "missing server-verified browser-session subject (R-20.7-l)");
    }
    if (!string.Equals(mcpSessionSubject, browserSessionSubject, StringComparison.Ordinal))
    {
      return new ElicitationUserBindingResult(false, UserBindingFailure.SubjectMismatch,
        mcpSessionSubject, browserSessionSubject, null);
    }
    return new ElicitationUserBindingResult(true, UserBindingFailure.None, null, null, null);
  }
}
