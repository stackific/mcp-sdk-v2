using System.Text.Json.Nodes;

using Stackific.Mcp.Protocol;

using static Stackific.Mcp.Protocol.ElicitationForm;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for the S31 restricted form-schema system, result-action semantics, the §20.6
/// completion handler, and the §20.7 consent/security helpers (spec §20.4–§20.8). Mirrors the TypeScript
/// <c>elicitation-form.test.ts</c> acceptance criteria AC-31.1 … AC-31.32, with explicit coverage of the
/// security-critical edges: nesting/bad-type rejection, enum membership, min/max, content typing,
/// url-mode-accept-with-content rejection, sensitive-field detection, URL safety / Punycode, and
/// cross-user identity binding.
/// </summary>
public sealed class ElicitationFormTests
{
  /// <summary>A representative form-mode <c>requestedSchema</c> reused across tests (mirrors the TS sample).</summary>
  private static JsonNode SampleSchema() => JsonNode.Parse("""
    {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "Your full name", "maxLength": 120 },
        "email": { "type": "string", "format": "email", "description": "Your email address" },
        "age": { "type": "integer", "minimum": 18, "default": 18 },
        "newsletter": { "type": "boolean", "default": false },
        "plan": {
          "type": "string",
          "title": "Plan",
          "oneOf": [
            { "const": "free", "title": "Free" },
            { "const": "pro", "title": "Pro" }
          ],
          "default": "free"
        }
      },
      "required": ["name", "email"]
    }
    """)!;

  // ── AC-31.1 (R-20.4-a) restricted flat object of primitive properties ──

  [Fact]
  public void Restricted_schema_accepts_flat_object_of_primitives()
  {
    Assert.True(ValidateRestrictedFormSchema(SampleSchema()).Valid);
    Assert.True(IsRestrictedFormSchema(SampleSchema()));
  }

  [Fact]
  public void Restricted_schema_rejects_a_nested_object_property()
  {
    var nested = JsonNode.Parse("""
      { "type": "object", "properties": { "address": { "type": "object", "properties": { "city": { "type": "string" } } } } }
      """);
    Assert.False(ValidateRestrictedFormSchema(nested).Valid);
    Assert.False(IsRestrictedFormSchema(nested));
  }

  [Fact]
  public void Restricted_schema_rejects_array_of_objects_property()
  {
    var arr = JsonNode.Parse("""
      { "type": "object", "properties": { "items": { "type": "array", "items": { "type": "object", "properties": {} } } } }
      """);
    Assert.False(ValidateRestrictedFormSchema(arr).Valid);
  }

  [Fact]
  public void Restricted_schema_rejects_composition_keyword_ref()
  {
    var composed = JsonNode.Parse("""
      { "type": "object", "properties": { "x": { "$ref": "#/$defs/Thing" } } }
      """);
    Assert.False(ValidateRestrictedFormSchema(composed).Valid);
  }

  [Fact]
  public void Restricted_schema_rejects_required_naming_undeclared_property()
  {
    var schema = JsonNode.Parse("""
      { "type": "object", "properties": { "a": { "type": "string" } }, "required": ["a", "ghost"] }
      """);
    Assert.False(ValidateRestrictedFormSchema(schema).Valid);
  }

  [Fact]
  public void Restricted_schema_rejects_non_object_root()
  {
    Assert.False(ValidateRestrictedFormSchema(JsonValue.Create(42)).Valid);
    Assert.False(ValidateRestrictedFormSchema(JsonNode.Parse("""{ "type": "string", "properties": {} }""")).Valid);
  }

  // ── AC-31.3 (R-20.4-c) per-field default extraction ──

  [Fact]
  public void Extract_defaults_returns_declared_defaults_across_kinds()
  {
    var defaults = ExtractDefaults(SampleSchema());
    Assert.Equal(3, defaults.Count);
    Assert.Equal(18, defaults["age"]!.GetValue<int>());
    Assert.False(defaults["newsletter"]!.GetValue<bool>());
    Assert.Equal("free", defaults["plan"]!.GetValue<string>());
  }

  // ── AC-31.4 (R-20.4-d) StringSchema.format restricted to four literals ──

  [Theory]
  [InlineData("email")]
  [InlineData("uri")]
  [InlineData("date")]
  [InlineData("date-time")]
  public void String_schema_accepts_each_permitted_format(string format)
  {
    var schema = JsonNode.Parse($$"""{ "type": "string", "format": "{{format}}" }""");
    Assert.True(IsStringSchema(schema));
    Assert.True(IsStringSchemaFormat(JsonValue.Create(format)));
  }

  [Fact]
  public void String_schema_rejects_unknown_format()
  {
    Assert.False(IsStringSchema(JsonNode.Parse("""{ "type": "string", "format": "phone" }""")));
    Assert.False(IsStringSchemaFormat(JsonValue.Create("phone")));
  }

  [Fact]
  public void String_schema_formats_are_the_exact_four()
  {
    Assert.Equal(new[] { "email", "uri", "date", "date-time" }, StringSchemaFormats);
  }

  // ── AC-31.5 (R-20.4-e) NumberSchema.type restricted to number|integer ──

  [Theory]
  [InlineData("number")]
  [InlineData("integer")]
  public void Number_schema_accepts_number_and_integer(string type)
  {
    Assert.True(IsNumberSchema(JsonNode.Parse($$"""{ "type": "{{type}}" }""")));
  }

  [Fact]
  public void Number_schema_rejects_other_types()
  {
    Assert.False(IsNumberSchema(JsonNode.Parse("""{ "type": "bigint" }""")));
    Assert.False(IsNumberSchema(JsonNode.Parse("""{ "type": "string" }""")));
  }

  [Fact]
  public void Integer_with_minimum_classifies_as_number()
  {
    Assert.Equal(PrimitiveSchemaKind.Number, ClassifyPrimitiveSchema(JsonNode.Parse("""{ "type": "integer", "minimum": 0 }""")));
  }

  // ── AC-31.6 (R-20.4-f) legacy enum classification ──

  [Fact]
  public void Legacy_titled_enum_is_classified_and_detected()
  {
    var legacy = JsonNode.Parse("""{ "type": "string", "enum": ["r", "g", "b"], "enumNames": ["Red", "Green", "Blue"] }""");
    Assert.Equal(EnumSchemaForm.LegacyTitled, ClassifyEnumSchema(legacy));
    Assert.True(IsLegacyTitledEnumSchema(legacy));
    Assert.True(IsEnumSchema(legacy));
  }

  [Fact]
  public void Modern_titled_single_select_is_not_legacy()
  {
    var modern = JsonNode.Parse("""{ "type": "string", "oneOf": [{ "const": "r", "title": "Red" }] }""");
    Assert.False(IsLegacyTitledEnumSchema(modern));
    Assert.Equal(EnumSchemaForm.TitledSingleSelect, ClassifyEnumSchema(modern));
  }

  // ── AC-31.7 (R-20.4-g) all five enum forms classify distinctly ──

  [Fact]
  public void All_five_enum_forms_classify_distinctly()
  {
    Assert.Equal(EnumSchemaForm.UntitledSingleSelect, ClassifyEnumSchema(JsonNode.Parse("""{ "type": "string", "enum": ["a"] }""")));
    Assert.Equal(EnumSchemaForm.TitledSingleSelect, ClassifyEnumSchema(JsonNode.Parse("""{ "type": "string", "oneOf": [{ "const": "a", "title": "A" }] }""")));
    Assert.Equal(EnumSchemaForm.UntitledMultiSelect, ClassifyEnumSchema(JsonNode.Parse("""{ "type": "array", "items": { "type": "string", "enum": ["a"] } }""")));
    Assert.Equal(EnumSchemaForm.TitledMultiSelect, ClassifyEnumSchema(JsonNode.Parse("""{ "type": "array", "items": { "anyOf": [{ "const": "a", "title": "A" }] } }""")));
    Assert.Equal(EnumSchemaForm.LegacyTitled, ClassifyEnumSchema(JsonNode.Parse("""{ "type": "string", "enum": ["a"], "enumNames": ["A"] }""")));
  }

  [Fact]
  public void Classify_enum_returns_null_for_non_enum()
  {
    Assert.Null(ClassifyEnumSchema(JsonNode.Parse("""{ "type": "string" }""")));
    Assert.Null(ClassifyEnumSchema(JsonNode.Parse("""{ "type": "array", "items": { "type": "object" } }""")));
    Assert.Null(ClassifyEnumSchema(JsonValue.Create("x")));
  }

  // ── PrimitiveSchemaDefinition classification ──

  [Fact]
  public void Classify_primitive_schema_selects_each_kind()
  {
    Assert.Equal(PrimitiveSchemaKind.String, ClassifyPrimitiveSchema(JsonNode.Parse("""{ "type": "string" }""")));
    Assert.Equal(PrimitiveSchemaKind.Number, ClassifyPrimitiveSchema(JsonNode.Parse("""{ "type": "number" }""")));
    Assert.Equal(PrimitiveSchemaKind.Boolean, ClassifyPrimitiveSchema(JsonNode.Parse("""{ "type": "boolean" }""")));
    Assert.Equal(PrimitiveSchemaKind.Enum, ClassifyPrimitiveSchema(JsonNode.Parse("""{ "type": "string", "enum": ["a"] }""")));
    Assert.Null(ClassifyPrimitiveSchema(JsonNode.Parse("""{ "type": "object" }""")));
    Assert.True(IsPrimitiveSchemaDefinition(JsonNode.Parse("""{ "type": "boolean" }""")));
    Assert.False(IsPrimitiveSchemaDefinition(JsonNode.Parse("""{ "type": "null" }""")));
  }

  // ── AC-31.8 (R-20.5-a) action required and one of accept|decline|cancel ──

  [Theory]
  [InlineData("accept", true)]
  [InlineData("decline", true)]
  [InlineData("cancel", true)]
  [InlineData("maybe", false)]
  [InlineData(null, false)]
  public void Is_elicit_action_recognizes_the_three_literals(string? value, bool expected)
  {
    Assert.Equal(expected, IsElicitAction(value));
  }

  [Fact]
  public void Validate_elicit_result_rejects_unknown_action_via_strict_typing()
  {
    // The typed ElicitResult cannot carry "maybe"; mirror the malformed branch via resolveOutcome.
    var outcome = ResolveElicitActionOutcome(
      new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["x"] = "y" } },
      Elicitation.UrlMode);
    Assert.Equal(ElicitActionHandling.Malformed, outcome.Handle);
  }

  // ── AC-31.9 (R-20.5-b) content presence rules by mode and action ──

  [Fact]
  public void Form_mode_accept_permits_conforming_content()
  {
    var result = new ElicitResult
    {
      Action = ElicitationAction.Accept,
      Content = new JsonObject { ["name"] = "A", ["email"] = "a@b.co" },
    };
    Assert.True(ValidateElicitResult(result, Elicitation.FormMode, SampleSchema()).Valid);
  }

  [Fact]
  public void Url_mode_accept_carrying_content_is_malformed()
  {
    // Credential-leak vector: content on a url-mode accept is rejected.
    var result = new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["x"] = "y" } };
    Assert.False(ValidateElicitResult(result, Elicitation.UrlMode).Valid);
  }

  [Fact]
  public void Content_on_decline_or_cancel_is_rejected()
  {
    var decline = new ElicitResult { Action = ElicitationAction.Decline, Content = new JsonObject { ["x"] = "y" } };
    var cancel = new ElicitResult { Action = ElicitationAction.Cancel, Content = new JsonObject { ["x"] = "y" } };
    Assert.False(ValidateElicitResult(decline, Elicitation.FormMode).Valid);
    Assert.False(ValidateElicitResult(cancel, Elicitation.FormMode).Valid);
  }

  [Fact]
  public void Url_mode_accept_without_content_is_valid()
  {
    Assert.True(ValidateElicitResult(new ElicitResult { Action = ElicitationAction.Accept }, Elicitation.UrlMode).Valid);
  }

  // ── AC-31.10 (R-20.5-c) content value typing and schema conformance ──

  [Fact]
  public void Content_value_types_accept_string_number_boolean_string_array()
  {
    Assert.True(IsElicitContentValue(JsonValue.Create("s")));
    Assert.True(IsElicitContentValue(JsonValue.Create(1)));
    Assert.True(IsElicitContentValue(JsonValue.Create(true)));
    Assert.True(IsElicitContentValue(new JsonArray("a", "b")));
  }

  [Fact]
  public void Content_value_types_reject_object_null_and_mixed_array()
  {
    Assert.False(IsElicitContentValue(new JsonObject()));
    Assert.False(IsElicitContentValue(null));
    Assert.False(IsElicitContentValue(new JsonArray(1, 2)));
  }

  [Fact]
  public void Validate_content_conforms_known_fields_types_and_constraints()
  {
    var ok = ValidateElicitContent(
      new JsonObject { ["name"] = "Octocat", ["email"] = "o@x.co", ["age"] = 30, ["newsletter"] = true, ["plan"] = "pro" },
      SampleSchema());
    Assert.True(ok.Valid);

    // integer field given a non-integer
    Assert.False(ValidateElicitContent(new JsonObject { ["name"] = "A", ["email"] = "a@b.co", ["age"] = 30.5 }, SampleSchema()).Valid);
    // below minimum
    Assert.False(ValidateElicitContent(new JsonObject { ["name"] = "A", ["email"] = "a@b.co", ["age"] = 5 }, SampleSchema()).Valid);
    // enum value not permitted
    Assert.False(ValidateElicitContent(new JsonObject { ["name"] = "A", ["email"] = "a@b.co", ["plan"] = "enterprise" }, SampleSchema()).Valid);
    // missing required field
    Assert.False(ValidateElicitContent(new JsonObject { ["name"] = "A" }, SampleSchema()).Valid);
    // unknown field
    Assert.False(ValidateElicitContent(new JsonObject { ["name"] = "A", ["email"] = "a@b.co", ["nope"] = "x" }, SampleSchema()).Valid);
    // wrong type for a boolean field
    Assert.False(ValidateElicitContent(new JsonObject { ["name"] = "A", ["email"] = "a@b.co", ["newsletter"] = "yes" }, SampleSchema()).Valid);
  }

  [Fact]
  public void Validate_content_rejects_disallowed_value_types_up_front()
  {
    // An object value is not a permitted content type, independent of the schema.
    var content = new JsonObject { ["name"] = new JsonObject { ["nested"] = 1 } };
    Assert.False(ValidateElicitContent(content, SampleSchema()).Valid);
  }

  [Fact]
  public void Validate_content_checks_multi_select_membership_and_min_max_items()
  {
    var multi = JsonNode.Parse("""
      { "type": "object", "properties": { "tags": { "type": "array", "minItems": 1, "maxItems": 2, "items": { "type": "string", "enum": ["a", "b", "c"] } } } }
      """)!;
    Assert.True(ValidateElicitContent(new JsonObject { ["tags"] = new JsonArray("a", "b") }, multi).Valid);
    Assert.False(ValidateElicitContent(new JsonObject { ["tags"] = new JsonArray() }, multi).Valid); // < minItems
    Assert.False(ValidateElicitContent(new JsonObject { ["tags"] = new JsonArray("a", "b", "c") }, multi).Valid); // > maxItems
    Assert.False(ValidateElicitContent(new JsonObject { ["tags"] = new JsonArray("z") }, multi).Valid); // not a member
  }

  [Fact]
  public void Validate_content_honors_string_min_and_max_length()
  {
    var schema = JsonNode.Parse("""
      { "type": "object", "properties": { "code": { "type": "string", "minLength": 2, "maxLength": 4 } } }
      """)!;
    Assert.True(ValidateElicitContent(new JsonObject { ["code"] = "abc" }, schema).Valid);
    Assert.False(ValidateElicitContent(new JsonObject { ["code"] = "a" }, schema).Valid);
    Assert.False(ValidateElicitContent(new JsonObject { ["code"] = "abcde" }, schema).Valid);
  }

  // ── AC-31.11–31.14 (R-20.5-d..h) action outcome branches ──

  [Fact]
  public void Form_mode_accept_resolves_to_process_form_data_with_content()
  {
    var outcome = ResolveElicitActionOutcome(
      new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["name"] = "A", ["email"] = "a@b.co" } },
      Elicitation.FormMode, SampleSchema());
    Assert.Equal(ElicitActionHandling.ProcessFormData, outcome.Handle);
    Assert.Equal("A", outcome.Content!["name"]!.GetValue<string>());
  }

  [Fact]
  public void Url_mode_accept_resolves_to_await_url_completion()
  {
    var outcome = ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Accept }, Elicitation.UrlMode);
    Assert.Equal(ElicitActionHandling.AwaitUrlCompletion, outcome.Handle);
  }

  [Fact]
  public void Decline_and_cancel_resolve_to_their_paths()
  {
    Assert.Equal(ElicitActionHandling.Declined,
      ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Decline }, Elicitation.FormMode).Handle);
    Assert.Equal(ElicitActionHandling.Cancelled,
      ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Cancel }, Elicitation.UrlMode).Handle);
  }

  [Fact]
  public void Non_conforming_form_accept_is_malformed_never_success()
  {
    var outcome = ResolveElicitActionOutcome(
      new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["name"] = "A", ["email"] = "a@b.co", ["age"] = "old" } },
      Elicitation.FormMode, SampleSchema());
    Assert.Equal(ElicitActionHandling.Malformed, outcome.Handle);
    Assert.NotEmpty(outcome.Errors);
  }

  [Fact]
  public void Every_action_maps_to_a_distinct_branch()
  {
    var branches = new HashSet<ElicitActionHandling>
    {
      ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["name"] = "A", ["email"] = "a@b.co" } }, Elicitation.FormMode, SampleSchema()).Handle,
      ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Accept }, Elicitation.UrlMode).Handle,
      ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Decline }, Elicitation.FormMode).Handle,
      ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Cancel }, Elicitation.FormMode).Handle,
      // a url-mode accept carrying content is malformed
      ResolveElicitActionOutcome(new ElicitResult { Action = ElicitationAction.Accept, Content = new JsonObject { ["x"] = "y" } }, Elicitation.UrlMode).Handle,
    };
    Assert.Equal(
      new HashSet<ElicitActionHandling>
      {
        ElicitActionHandling.ProcessFormData,
        ElicitActionHandling.AwaitUrlCompletion,
        ElicitActionHandling.Declined,
        ElicitActionHandling.Cancelled,
        ElicitActionHandling.Malformed,
      },
      branches);
  }

  // ── AC-31.15 (R-20.5-i,j) client validates before send ──

  [Fact]
  public void Build_accept_result_validates_content_before_producing()
  {
    var result = BuildAcceptResult(new JsonObject { ["name"] = "A", ["email"] = "a@b.co", ["age"] = 20 }, SampleSchema());
    Assert.Equal(ElicitationAction.Accept, result.Action);
    Assert.Equal("A", result.Content!["name"]!.GetValue<string>());
  }

  [Fact]
  public void Build_accept_result_throws_on_non_conforming_content()
  {
    Assert.Throws<ArgumentException>(() =>
      BuildAcceptResult(new JsonObject { ["name"] = "A" }, SampleSchema()));
  }

  [Fact]
  public void Result_builders_produce_the_expected_actions()
  {
    Assert.Equal(ElicitationAction.Accept, BuildUrlAcceptResult().Action);
    Assert.Null(BuildUrlAcceptResult().Content);
    Assert.Equal(ElicitationAction.Decline, BuildDeclineResult().Action);
    Assert.Equal(ElicitationAction.Cancel, BuildCancelResult().Action);
  }

  // ── AC-31.16/31.17 (R-20.6-a..c) elicitation-complete notification ──

  [Fact]
  public void Complete_notification_builds_well_formed_shape()
  {
    Assert.Equal("notifications/elicitation/complete", ElicitationCompleteNotificationMethod);
    var n = BuildElicitationCompleteNotification("id-123");
    Assert.Equal(ElicitationCompleteNotificationMethod, n["method"]!.GetValue<string>());
    Assert.Equal("2.0", n["jsonrpc"]!.GetValue<string>());
    Assert.Equal("id-123", n["params"]!["elicitationId"]!.GetValue<string>());
    Assert.True(IsElicitationCompleteNotification(n));
    Assert.False(n.ContainsKey("id")); // it is a notification
  }

  [Fact]
  public void Complete_notification_rejects_empty_id()
  {
    Assert.Throws<ArgumentException>(() => BuildElicitationCompleteNotification(""));
    var malformed = JsonNode.Parse("""{ "jsonrpc": "2.0", "method": "notifications/elicitation/complete", "params": {} }""");
    Assert.False(IsElicitationCompleteNotification(malformed));
  }

  // ── AC-31.18/31.19 (R-20.6-d,e) ignore unknown / already-completed; complete pending ──

  [Fact]
  public void Handle_complete_ignores_unknown_id()
  {
    var n = BuildElicitationCompleteNotification("x");
    var handling = HandleElicitationComplete(n, new Dictionary<string, ElicitationLifecycleState>());
    Assert.Equal(ElicitationCompleteAction.Ignore, handling.Action);
    Assert.Equal(ElicitationCompleteIgnoreReason.UnknownId, handling.Reason);
  }

  [Fact]
  public void Handle_complete_ignores_already_completed_id()
  {
    var n = BuildElicitationCompleteNotification("x");
    var handling = HandleElicitationComplete(n, new Dictionary<string, ElicitationLifecycleState> { ["x"] = ElicitationLifecycleState.Completed });
    Assert.Equal(ElicitationCompleteAction.Ignore, handling.Action);
    Assert.Equal(ElicitationCompleteIgnoreReason.AlreadyCompleted, handling.Reason);
  }

  [Fact]
  public void Handle_complete_ignores_a_malformed_notification()
  {
    var handling = HandleElicitationComplete(JsonNode.Parse("""{ "method": "other" }"""),
      new Dictionary<string, ElicitationLifecycleState> { ["x"] = ElicitationLifecycleState.Pending });
    Assert.Equal(ElicitationCompleteAction.Ignore, handling.Action);
  }

  [Fact]
  public void Handle_complete_completes_a_pending_id()
  {
    var n = BuildElicitationCompleteNotification("x");
    var handling = HandleElicitationComplete(n, new Dictionary<string, ElicitationLifecycleState> { ["x"] = ElicitationLifecycleState.Pending });
    Assert.Equal(ElicitationCompleteAction.Complete, handling.Action);
    Assert.Equal("x", handling.ElicitationId);
  }

  [Fact]
  public void Handle_complete_treats_a_foreign_id_as_unknown_initiator_scope()
  {
    var n = BuildElicitationCompleteNotification("foreign-id");
    var handling = HandleElicitationComplete(n, new Dictionary<string, ElicitationLifecycleState> { ["my-id"] = ElicitationLifecycleState.Pending });
    Assert.Equal(ElicitationCompleteAction.Ignore, handling.Action);
    Assert.Equal(ElicitationCompleteIgnoreReason.UnknownId, handling.Reason);
  }

  // ── AC-31.23 (R-20.7-h,i) sensitive info ⇒ url mode; contact data permitted in form ──

  [Fact]
  public void Find_sensitive_fields_flags_credential_fields()
  {
    var sensitive = JsonNode.Parse("""
      { "type": "object", "properties": { "password": { "type": "string" }, "api_key": { "type": "string", "title": "API Key" }, "token": { "type": "string" } } }
      """);
    var flagged = FindSensitiveFormFields(sensitive);
    Assert.Contains("password", flagged);
    Assert.Contains("api_key", flagged);
    Assert.Contains("token", flagged);
    var check = AssertFormModeMayCollect(sensitive);
    Assert.False(check.Ok);
    Assert.NotEmpty(check.SensitiveFields);
  }

  [Fact]
  public void Find_sensitive_fields_does_not_flag_contact_data()
  {
    var contact = JsonNode.Parse("""
      { "type": "object", "properties": { "name": { "type": "string" }, "email": { "type": "string", "format": "email" }, "username": { "type": "string" } } }
      """);
    Assert.Empty(FindSensitiveFormFields(contact));
    Assert.True(AssertFormModeMayCollect(contact).Ok);
  }

  // ── AC-31.24–31.26 (R-20.7-j..o) identity binding & verification ──

  [Fact]
  public void User_binding_passes_when_subjects_match()
  {
    Assert.True(VerifyElicitationUserBinding("user-1", "user-1").Ok);
  }

  [Fact]
  public void User_binding_rejects_a_subject_mismatch()
  {
    var r = VerifyElicitationUserBinding("victim", "attacker");
    Assert.False(r.Ok);
    Assert.Equal(UserBindingFailure.SubjectMismatch, r.Reason);
    Assert.Equal("victim", r.Expected);
    Assert.Equal("attacker", r.Actual);
  }

  [Fact]
  public void User_binding_rejects_missing_authoritative_subjects()
  {
    Assert.False(VerifyElicitationUserBinding(null, "x").Ok);
    Assert.False(VerifyElicitationUserBinding("x", null).Ok);
    Assert.Equal(UserBindingFailure.UnverifiedIdentity, VerifyElicitationUserBinding(null, null).Reason);
  }

  // ── AC-31.27/31.28 (R-20.7-p,q,r,s) safe URL construction ──

  [Fact]
  public void Url_safety_accepts_a_clean_https_url()
  {
    Assert.True(CheckElicitationUrlSafety("https://mcp.example.com/ui/set_api_key").Safe);
  }

  [Fact]
  public void Url_safety_flags_sensitive_query_params_and_embedded_credentials()
  {
    Assert.False(CheckElicitationUrlSafety("https://x.example.com/cb?access_token=abc").Safe);
    var r2 = CheckElicitationUrlSafety("https://user:pass@x.example.com/");
    Assert.False(r2.Safe);
    Assert.Contains(r2.Reasons, x => x.Reason == UnsafeUrlReason.PreAuthenticated);
  }

  [Fact]
  public void Url_safety_flags_non_https_unless_allow_insecure()
  {
    Assert.False(CheckElicitationUrlSafety("http://localhost:3000/ui").Safe);
    Assert.True(CheckElicitationUrlSafety("http://localhost:3000/ui", allowInsecure: true).Safe);
  }

  [Fact]
  public void Url_safety_rejects_an_invalid_url()
  {
    var r = CheckElicitationUrlSafety("not a url");
    Assert.False(r.Safe);
    Assert.Contains(r.Reasons, x => x.Reason == UnsafeUrlReason.InvalidUrl);
  }

  [Theory]
  [InlineData("description", "form", false)]
  [InlineData("url", "form", false)]
  [InlineData("message", "url", false)]
  [InlineData("url", "url", true)]
  public void Only_url_field_of_url_mode_is_clickable(string field, string mode, bool expected)
  {
    Assert.Equal(expected, MayRenderUrlClickable(field, mode));
  }

  // ── AC-31.29–31.31 (R-20.7-t..y) safe URL handling (client) ──

  [Fact]
  public void Consent_presentation_shows_url_host_domain_scheme()
  {
    var p = BuildUrlConsentPresentation("https://login.mcp.example.com/oauth?x=1");
    Assert.Equal("https://login.mcp.example.com/oauth?x=1", p.FullUrl);
    Assert.Equal("login.mcp.example.com", p.Host);
    Assert.Equal("example.com", p.Domain);
    Assert.Equal("https", p.Scheme);
    Assert.False(p.ContainsPunycode);
  }

  [Fact]
  public void Consent_presentation_warns_about_punycode()
  {
    var p = BuildUrlConsentPresentation("https://xn--80ak6aa92e.com/path");
    Assert.True(p.ContainsPunycode);
    Assert.Contains(p.Warnings, w => w.Contains("Punycode", StringComparison.OrdinalIgnoreCase));
  }

  [Fact]
  public void Consent_presentation_warns_about_non_https_and_embedded_credentials()
  {
    var p = BuildUrlConsentPresentation("http://user:pass@evil.example.com/");
    Assert.True(p.Warnings.Count >= 2);
  }

  [Fact]
  public void Consent_presentation_rejects_an_invalid_url()
  {
    Assert.Throws<ArgumentException>(() => BuildUrlConsentPresentation("not a url"));
  }
}
