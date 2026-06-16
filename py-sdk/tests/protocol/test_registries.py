"""Tests for the Consolidated Registries — Methods, Errors, ``_meta`` Keys,
Capabilities & Types (Appendices A–E).

Mirrors ``ts-sdk/src/__tests__/protocol/registries.test.ts`` and adds Python-specific
edge cases. AC coverage:

* AC-46.1  (R-AppB-a) — a custom error code must not collide with any registry code
* AC-46.2  (R-AppB-b) — codes in -32000..-32099 accepted only if collision-free; -32001 reserved
* AC-46.3  (R-AppC-a) — registry-reserved keys are permitted, not unknown/custom
* AC-46.4  (R-AppC-b) — protocolVersion REQUIRED on every client request
* AC-46.5  (R-AppC-c) — clientInfo REQUIRED on every client request
* AC-46.6  (R-AppC-d) — clientCapabilities REQUIRED on every client request
* AC-46.7  (R-AppC-e) — logLevel OPTIONAL and Deprecated
* AC-46.8  (R-AppC-f) — progressToken OPTIONAL; string|number echoed by notifications/progress
* AC-46.9  (R-AppC-g) — traceparent/tracestate/baggage OPTIONAL on requests and notifications
* AC-46.10 (R-AppC-h, R-AppD-f) — UI host value carries REQUIRED mimeTypes
* AC-46.11 (R-AppC-i) — tool _meta.ui requires resourceUri (ui:// URI), optional visibility
* AC-46.12 (R-AppC-j) — extension-defined identifiers/keys permitted in _meta / extensions
* AC-46.13 (R-AppD-a) — elicitation: form OPTIONAL; url the other mode
* AC-46.14 (R-AppD-b) — sampling: tools & context OPTIONAL (context Deprecated); capability Deprecated
* AC-46.15 (R-AppD-c) — tools: listChanged OPTIONAL boolean
* AC-46.16 (R-AppD-d) — resources: listChanged & subscribe OPTIONAL booleans
* AC-46.17 (R-AppD-e) — prompts: listChanged OPTIONAL boolean
* AC-46.18 (R-AppD-f) — UI host mimeTypes REQUIRED incl. text/html;profile=mcp-app; ack MAY be empty
"""

from mcp.protocol.errors import (
  HEADER_MISMATCH_CODE,
  INTERNAL_ERROR_CODE,
  INVALID_PARAMS_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  PARSE_ERROR_CODE,
  RESOURCE_NOT_FOUND_LEGACY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
)
from mcp.protocol.registries import (
  APPENDIX_B_RESERVED_CODE_SET,
  CAPABILITY_REGISTRY,
  CAPABILITY_SIDES,
  ERROR_CODE_REGISTRY,
  META_KEY_REGISTRY,
  METHOD_REGISTRY,
  RESERVED_ERROR_CODES,
  SERVER_ERROR_RANGE,
  TYPE_REGISTRY,
  UI_DIALECT_METHOD_INDEX,
  UI_HOST_REQUIRED_MIME_TYPE,
  CapabilityRegistryEntry,
  CapabilitySubFlag,
  MetaKeyRegistryEntry,
  MethodNotificationIndexEntry,
  RegistryMethodKind,
  TypeIndexEntry,
  is_error_code_defined_by_document,
  is_meta_key_permitted,
  is_registered_method,
  is_reserved_meta_key,
  lookup_capability,
  lookup_capability_sub_flag,
  lookup_meta_key,
  lookup_method,
  lookup_type,
  required_client_request_meta_keys,
  validate_custom_error_code,
  validate_tool_ui_meta_value,
  validate_ui_host_value,
)

# The eight codes the document pins in Appendix B / the §22 registry.
_REGISTRY_CODES = [
  PARSE_ERROR_CODE,
  INVALID_REQUEST_CODE,
  METHOD_NOT_FOUND_CODE,
  INVALID_PARAMS_CODE,
  INTERNAL_ERROR_CODE,
  MISSING_CLIENT_CAPABILITY_CODE,
  UNSUPPORTED_PROTOCOL_VERSION_CODE,
  HEADER_MISMATCH_CODE,
]

#: Golden, ordered method/notification index (Appendix A). A frozen list catches a dropped,
#: renamed, or reordered row that a bare count assertion would miss. Verified out of band to
#: mirror the ts-sdk reference; embedded so this suite stays self-contained.
_GOLDEN_METHOD_NAMES = (
    "server/discover", "tools/list", "tools/call",
    "resources/list", "resources/read", "resources/templates/list",
    "prompts/list", "prompts/get", "completion/complete",
    "subscriptions/listen", "elicitation/create", "sampling/createMessage",
    "roots/list", "tasks/get", "tasks/update",
    "tasks/cancel", "ui/initialize", "ui/notifications/initialized",
    "notifications/progress", "notifications/cancelled", "notifications/message",
    "notifications/tools/list_changed", "notifications/prompts/list_changed", "notifications/resources/list_changed",
    "notifications/resources/updated", "notifications/subscriptions/acknowledged", "notifications/elicitation/complete",
    "notifications/tasks",
)

#: Golden, ordered consolidated type index (Appendix E). The published order is broadly
#: alphabetical; this frozen list pins every row so dropping ~50 of the rows (which a
#: ``> 100`` guard would not catch) fails loudly. Verified out of band against ts-sdk.
_GOLDEN_TYPE_NAMES = (
    "Annotations", "AudioContent", "AuthorizationServerMetadata", "BaseMetadata",
    "BlobResourceContents", "BooleanSchema", "CacheableResult", "CallToolRequest",
    "CallToolResult", "CancelledNotification", "CancelledNotificationParams", "CancelledTask",
    "CancelTaskRequest", "CancelTaskResult", "ClientCapabilities", "ClientIdMetadataDocument",
    "ClientRegistrationRequest", "ClientRegistrationResponse", "ClientSamplingCapability", "CompletedTask",
    "CompleteRequest", "CompleteRequestParams", "CompleteResult", "CompletionsCapability",
    "ContentBlock", "CreateMessageRequest", "CreateMessageRequestParams", "CreateMessageResult",
    "CreateTaskResult", "Cursor", "DetailedTask", "DiscoverRequest",
    "DiscoverResult", "DiscoverResultResponse", "ElicitRequest", "ElicitRequestFormParams",
    "ElicitRequestParams", "ElicitRequestURLParams", "ElicitResult", "EmbeddedResource",
    "EmptyResult", "EnumSchema", "Error", "ExtensionSettings",
    "FailedTask", "GetPromptRequest", "GetPromptResult", "GetTaskRequest",
    "GetTaskResult", "Icon", "Icons", "ImageContent",
    "Implementation", "InputRequest", "InputRequests", "InputRequiredResult",
    "InputRequiredTask", "InputResponse", "InputResponseRequestParams", "InputResponses",
    "JSONArray", "JSONObject", "JSONRPCErrorResponse", "JSONRPCMessage",
    "JSONRPCNotification", "JSONRPCRequest", "JSONRPCResponse", "JSONRPCResultResponse",
    "JSONValue", "LegacyTitledEnumSchema", "ListPromptsRequest", "ListPromptsResult",
    "ListResourcesRequest", "ListResourcesResult", "ListResourceTemplatesRequest", "ListResourceTemplatesResult",
    "ListRootsRequest", "ListRootsResult", "ListToolsRequest", "ListToolsResult",
    "LoggingLevel", "LoggingMessageNotification", "LoggingMessageNotificationParams", "MetaObject",
    "MissingRequiredClientCapabilityError", "ModelHint", "ModelPreferences", "Notification",
    "NotificationParams", "NumberSchema", "OpenLinkParams", "PaginatedRequestParams",
    "PaginatedResult", "PrimitiveSchemaDefinition", "ProgressNotification", "ProgressNotificationParams",
    "ProgressToken", "Prompt", "PromptArgument", "PromptListChangedNotification",
    "PromptMessage", "PromptReference", "PromptsCapability", "ProtectedResourceMetadata",
    "ReadResourceRequest", "ReadResourceRequestParams", "ReadResourceResult", "Request",
    "RequestId", "RequestMetaObject", "RequestParams", "RequestProtocolVersionMeta",
    "Resource", "ResourceContents", "ResourceLink", "ResourceListChangedNotification",
    "ResourceNotFoundError", "ResourcesServerCapability", "ResourceTeardownParams", "ResourceTemplate",
    "ResourceTemplateReference", "ResourceUiMeta", "ResourceUpdatedNotification", "ResourceUpdatedNotificationParams",
    "Result", "ResultType", "Role", "Root",
    "SamplingMessage", "SamplingMessageContentBlock", "SandboxResourceReadyParams", "ServerCapabilities",
    "SingleSelectEnumSchema", "SizeChangedParams", "StringSchema", "SubscriptionFilter",
    "SubscriptionsAcknowledgedNotification", "SubscriptionsAcknowledgedNotificationParams", "SubscriptionsListenRequest", "SubscriptionsListenRequestParams",
    "Task", "TaskStatus", "TaskStatusNotification", "TaskStatusNotificationParams",
    "TasksExtensionCapability", "TextContent", "TextResourceContents", "TitledMultiSelectEnumSchema",
    "TitledSingleSelectEnumSchema", "Tool", "ToolAnnotations", "ToolCancelledParams",
    "ToolChoice", "ToolInputParams", "ToolListChangedNotification", "ToolResultContent",
    "ToolResultParams", "ToolsCallParams", "ToolsCapability", "ToolUiMeta",
    "ToolUseContent", "TraceContextMeta", "UiContentSecurityPolicy", "UiHostContext",
    "UiHostExtensionCapability", "UiInitializeParams", "UiInitializeResult", "UiMessageParams",
    "UiPermissions", "UnsupportedProtocolVersionError", "UntitledMultiSelectEnumSchema", "UntitledSingleSelectEnumSchema",
    "UpdateModelContextParams", "UpdateTaskRequest", "UpdateTaskResult", "WorkingTask",
)


# ─── Appendix A — Method and Notification Index ────────────────────────────────

class TestAppendixAMethodIndex:
  def test_indexes_every_core_method_with_kind_direction_section(self):
    assert len(METHOD_REGISTRY) == 28
    for entry in METHOD_REGISTRY:
      assert isinstance(entry, MethodNotificationIndexEntry)
      assert isinstance(entry.name, str)
      assert len(entry.name) > 0
      assert entry.kind in tuple(RegistryMethodKind)
      assert len(entry.direction) > 0
      assert entry.defined_in.startswith("§")

  def test_method_index_matches_golden_list(self):
    # Golden cross-check: exact set + order. Catches a dropped, renamed, or reordered
    # method/notification that the count assertion alone would miss.
    assert tuple(e.name for e in METHOD_REGISTRY) == _GOLDEN_METHOD_NAMES

  def test_input_request_kinds_classified_and_delivered_via_section_11(self):
    for name in ("elicitation/create", "sampling/createMessage", "roots/list"):
      entry = lookup_method(name)
      assert entry is not None
      assert entry.kind is RegistryMethodKind.INPUT_REQUEST
      assert "input-required result" in entry.direction

  def test_records_core_requests_and_notifications_with_direction(self):
    tools_list = lookup_method("tools/list")
    assert tools_list is not None
    assert tools_list.kind is RegistryMethodKind.REQUEST
    assert tools_list.direction == "client→server"

    message = lookup_method("notifications/message")
    assert message is not None
    assert message.kind is RegistryMethodKind.NOTIFICATION
    assert message.direction == "server→client"

    progress = lookup_method("notifications/progress")
    assert progress is not None
    assert progress.direction == "client→server or server→client"

  def test_ui_dialect_names_scoped_to_active_ui_extension(self):
    # Not in the core index:
    assert is_registered_method("ui/open-link") is False
    assert lookup_method("ui/open-link") is None
    # Found only when the UI dialect is included:
    ui_entry = lookup_method("ui/open-link", include_ui_dialect=True)
    assert ui_entry is not None
    assert ui_entry.extension_scoped is True
    # The two handshake names are part of the core index but marked extension-scoped:
    handshake = lookup_method("ui/initialize")
    assert handshake is not None
    assert handshake.extension_scoped is True
    assert all(e.extension_scoped for e in UI_DIALECT_METHOD_INDEX)

  def test_ui_initialized_handshake_is_a_notification_in_core_index(self):
    entry = lookup_method("ui/notifications/initialized")
    assert entry is not None
    assert entry.kind is RegistryMethodKind.NOTIFICATION
    assert entry.extension_scoped is True

  def test_unknown_method_returns_none(self):
    assert lookup_method("does/not-exist") is None
    assert lookup_method("does/not-exist", include_ui_dialect=True) is None
    assert is_registered_method("does/not-exist") is False

  def test_core_index_preferred_over_ui_dialect_for_shadowing_names(self):
    # tools/call appears in both the core index and the UI-dialect index; the core
    # entry (client→server) must win even when include_ui_dialect is True.
    entry = lookup_method("tools/call", include_ui_dialect=True)
    assert entry is not None
    assert entry.direction == "client→server"
    assert entry.extension_scoped is False

  def test_ui_dialect_only_name_resolves_to_dialect_entry(self):
    # ui/message exists only in the UI-dialect index.
    assert lookup_method("ui/message") is None
    entry = lookup_method("ui/message", include_ui_dialect=True)
    assert entry is not None
    assert "UI↔host" in entry.direction

  def test_method_registry_has_no_duplicate_names(self):
    names = [e.name for e in METHOD_REGISTRY]
    assert len(set(names)) == len(names)

  def test_method_kind_is_str_enum_value(self):
    # StrEnum members compare equal to their wire string values.
    assert RegistryMethodKind.REQUEST == "request"
    assert RegistryMethodKind.NOTIFICATION == "notification"
    assert RegistryMethodKind.INPUT_REQUEST == "input-request kind"


# ─── Appendix B — Error Code Registry (reuses §22) ─────────────────────────────

class TestAppendixBErrorCodeRegistry:
  def test_re_exports_the_section_22_registry_unchanged(self):
    for code in _REGISTRY_CODES:
      assert code in ERROR_CODE_REGISTRY
      assert ERROR_CODE_REGISTRY[code] is not None

  def test_ac_46_1_custom_code_colliding_with_listed_code_non_conformant(self):
    for code in _REGISTRY_CODES:
      assert is_error_code_defined_by_document(code) is True
      result = validate_custom_error_code(code)
      assert result.ok is False
      assert result.reason == "collides-with-reserved"
    # The full registry (including the legacy -32002 literal) is caught.
    assert is_error_code_defined_by_document(RESOURCE_NOT_FOUND_LEGACY_CODE) is True
    assert is_error_code_defined_by_document(-32002) is True
    # A genuinely custom, collision-free code is accepted.
    ok = validate_custom_error_code(-31000)
    assert ok.ok is True

  def test_ac_46_2_server_range_accepted_only_when_collision_free(self):
    assert SERVER_ERROR_RANGE.min == -32099
    assert SERVER_ERROR_RANGE.max == -32000
    # -32001 (HeaderMismatch) collides → rejected.
    collide = validate_custom_error_code(-32001)
    assert collide.ok is False
    assert collide.reason == "collides-with-reserved"
    # A free value inside the range is accepted and flagged as in-range.
    in_range = validate_custom_error_code(-32050)
    assert in_range.ok is True
    assert in_range.in_reserved_range is True
    # A free value outside the range is accepted and flagged out-of-range.
    out_of_range = validate_custom_error_code(-31000)
    assert out_of_range.ok is True
    assert out_of_range.in_reserved_range is False

  def test_ac_46_2_range_boundaries_are_in_reserved_range(self):
    # The inclusive boundaries -32000 and -32099 are themselves in-range (and free
    # of collision, since -32000 is not a registered code).
    low = validate_custom_error_code(-32099)
    high = validate_custom_error_code(-32000)
    assert low.ok is True and low.in_reserved_range is True
    assert high.ok is True and high.in_reserved_range is True
    # Just outside the lower boundary is out of range.
    below = validate_custom_error_code(-32100)
    assert below.ok is True and below.in_reserved_range is False

  def test_ac_46_2_non_integers_rejected_in_lockstep_with_section_22_helper(self):
    frac = validate_custom_error_code(-32000.5)
    assert frac.ok is False
    assert frac.reason == "not-an-integer"
    assert frac.in_reserved_range is None

  def test_bool_is_not_a_valid_error_code(self):
    # Python bools are ints; the §22 helper (and thus this one) must reject them.
    result = validate_custom_error_code(True)
    assert result.ok is False
    assert result.reason == "not-an-integer"

  def test_reserved_code_set_matches_section_22_list_and_includes_minus_32001(self):
    assert len(APPENDIX_B_RESERVED_CODE_SET) == len(RESERVED_ERROR_CODES)
    assert APPENDIX_B_RESERVED_CODE_SET == frozenset(RESERVED_ERROR_CODES)
    assert -32001 in APPENDIX_B_RESERVED_CODE_SET

  def test_is_error_code_defined_by_document_false_for_unrelated_code(self):
    assert is_error_code_defined_by_document(-31000) is False
    assert is_error_code_defined_by_document(1234) is False


# ─── Appendix C — Reserved _meta Key Registry ──────────────────────────────────

class TestAppendixCMetaKeyRegistry:
  def test_enumerates_every_reserved_key_with_used_on_meaning_section(self):
    for entry in META_KEY_REGISTRY:
      assert isinstance(entry, MetaKeyRegistryEntry)
      assert len(entry.key) > 0
      assert len(entry.used_on) > 0
      assert len(entry.meaning) > 0
      assert entry.defined_in.startswith("§")
      assert entry.requirement in ("required", "optional")

  def test_ac_46_3_registry_reserved_keys_are_permitted_not_unknown(self):
    reserved = [
      "io.modelcontextprotocol/protocolVersion",
      "io.modelcontextprotocol/clientInfo",
      "io.modelcontextprotocol/clientCapabilities",
      "io.modelcontextprotocol/logLevel",
      "io.modelcontextprotocol/subscriptionId",
      "io.modelcontextprotocol/tasks",
      "io.modelcontextprotocol/ui",
      "progressToken",
      "traceparent",
      "tracestate",
      "baggage",
    ]
    for key in reserved:
      assert is_reserved_meta_key(key) is True
      assert is_meta_key_permitted(key) is True
    # Any other io.modelcontextprotocol/ key is reserved by prefix.
    assert is_reserved_meta_key("io.modelcontextprotocol/somethingNew") is True
    assert is_meta_key_permitted("io.modelcontextprotocol/somethingNew") is True
    # A bare custom key (no prefix, not reserved-by-exception) is neither.
    assert is_reserved_meta_key("customBareKey") is False
    assert is_meta_key_permitted("customBareKey") is False

  def test_mcp_short_prefix_is_reserved(self):
    # The reservation rule triggers on the SECOND label being modelcontextprotocol/mcp.
    assert is_reserved_meta_key("com.mcp/foo") is True
    assert is_meta_key_permitted("com.mcp/foo") is True

  def test_ac_46_4_5_6_required_client_request_meta_keys(self):
    required = required_client_request_meta_keys()
    assert required == (
      "io.modelcontextprotocol/protocolVersion",
      "io.modelcontextprotocol/clientInfo",
      "io.modelcontextprotocol/clientCapabilities",
    )
    for key in required:
      entry = lookup_meta_key(key)
      assert entry is not None
      assert entry.requirement == "required"
      assert entry.used_on.startswith("every client request")

  def test_ac_46_7_log_level_is_optional_and_deprecated(self):
    entry = lookup_meta_key("io.modelcontextprotocol/logLevel")
    assert entry is not None
    assert entry.requirement == "optional"
    assert entry.deprecated is True

  def test_ac_46_8_progress_token_optional_echoed_by_progress(self):
    entry = lookup_meta_key("progressToken")
    assert entry is not None
    assert entry.requirement == "optional"
    assert "notifications/progress" in entry.meaning
    assert "string or number" in entry.meaning

  def test_ac_46_9_trace_keys_optional_on_requests_and_notifications(self):
    for key in ("traceparent", "tracestate", "baggage"):
      entry = lookup_meta_key(key)
      assert entry is not None
      assert entry.requirement == "optional"
      assert "request and notification" in entry.used_on

  def test_subscription_id_used_on_notification_stream(self):
    entry = lookup_meta_key("io.modelcontextprotocol/subscriptionId")
    assert entry is not None
    assert entry.requirement == "optional"
    assert "subscription" in entry.used_on

  def test_ac_46_12_extension_keys_not_in_registry_still_permitted(self):
    # A non-reserved, validly prefixed extension key: permitted (but not reserved).
    assert is_reserved_meta_key("com.example.acme/customKey") is False
    assert is_meta_key_permitted("com.example.acme/customKey") is True
    # It is not an enumerated registry row.
    assert lookup_meta_key("com.example.acme/customKey") is None

  def test_lookup_meta_key_unknown_returns_none(self):
    assert lookup_meta_key("not/a-registered-key") is None
    assert lookup_meta_key("totallyUnknown") is None

  def test_meta_key_registry_has_no_duplicate_keys(self):
    keys = [e.key for e in META_KEY_REGISTRY]
    assert len(set(keys)) == len(keys)

  def test_only_three_keys_required_on_client_requests(self):
    # All other registry rows must be optional (the three required ones are unique).
    required_rows = [e for e in META_KEY_REGISTRY if e.requirement == "required"]
    required_client = [e for e in required_rows if e.used_on.startswith("every client request")]
    assert len(required_client) == 3


# ─── Appendix C/D — UI host value and tool _meta.ui shapes ─────────────────────

class TestUiHostAndToolMetaShapes:
  def test_ac_46_10_18_ui_host_value_requires_mime_types(self):
    assert UI_HOST_REQUIRED_MIME_TYPE == "text/html;profile=mcp-app"

    ok = validate_ui_host_value({"mimeTypes": ["text/html;profile=mcp-app"]})
    assert ok.ok is True
    assert ok.reason is None

    # Absence of mimeTypes is non-conformant.
    missing = validate_ui_host_value({})
    assert missing.ok is False
    assert missing.reason == "missing-mimeTypes"

    # mimeTypes present but missing the required type.
    wrong = validate_ui_host_value({"mimeTypes": ["text/plain"]})
    assert wrong.ok is False
    assert wrong.reason == "missing-required-mime-type"

    # Non-array mimeTypes.
    not_array = validate_ui_host_value({"mimeTypes": "text/html;profile=mcp-app"})
    assert not_array.ok is False
    assert not_array.reason == "mimeTypes-not-array"

    # Non-object host value.
    none_value = validate_ui_host_value(None)
    assert none_value.ok is False
    assert none_value.reason == "not-an-object"

  def test_ui_host_value_rejects_list_and_string_as_not_object(self):
    assert validate_ui_host_value([]).reason == "not-an-object"
    assert validate_ui_host_value("nope").reason == "not-an-object"
    assert validate_ui_host_value(42).reason == "not-an-object"

  def test_ui_host_value_accepts_required_among_several_mime_types(self):
    result = validate_ui_host_value(
      {"mimeTypes": ["text/plain", "text/html;profile=mcp-app", "image/png"]}
    )
    assert result.ok is True

  def test_ac_46_18_server_acknowledgement_value_may_be_empty(self):
    # The capability entry documents both sides; the mimeTypes sub-flag's gates text
    # records that the acknowledgement value MAY be empty.
    entry = lookup_capability("io.modelcontextprotocol/ui")
    assert entry is not None
    assert entry.extension is True
    flag = lookup_capability_sub_flag("io.modelcontextprotocol/ui", "mimeTypes")
    assert flag is not None
    assert flag.requirement == "required"
    assert "server acknowledgement value MAY be empty" in flag.gates

  def test_ac_46_11_tool_meta_ui_requires_ui_resource_uri(self):
    full = validate_tool_ui_meta_value({"resourceUri": "ui://charts/line", "visibility": "inline"})
    assert full.ok is True
    assert full.reason is None

    # visibility omitted is still fine (OPTIONAL).
    minimal = validate_tool_ui_meta_value({"resourceUri": "ui://charts/line"})
    assert minimal.ok is True

    # resourceUri absent is non-conformant.
    no_uri = validate_tool_ui_meta_value({"visibility": "inline"})
    assert no_uri.ok is False
    assert no_uri.reason == "missing-resourceUri"

    # resourceUri not a ui:// URI is non-conformant.
    not_ui = validate_tool_ui_meta_value({"resourceUri": "https://example.com/x"})
    assert not_ui.ok is False
    assert not_ui.reason == "resourceUri-not-ui-uri"

    # Non-object value.
    not_obj = validate_tool_ui_meta_value("nope")
    assert not_obj.ok is False
    assert not_obj.reason == "not-an-object"

    # The registry marks the key REQUIRED and UI-extension-scoped.
    ui_key = lookup_meta_key("ui")
    assert ui_key is not None
    assert ui_key.requirement == "required"
    assert "user-interface extension is active" in ui_key.meaning

  def test_tool_meta_ui_rejects_non_string_resource_uri(self):
    # A numeric / None resourceUri is "missing" (not a string).
    assert validate_tool_ui_meta_value({"resourceUri": 123}).reason == "missing-resourceUri"
    assert validate_tool_ui_meta_value({"resourceUri": None}).reason == "missing-resourceUri"

  def test_tool_meta_ui_rejects_list_value_as_not_object(self):
    assert validate_tool_ui_meta_value([]).reason == "not-an-object"
    assert validate_tool_ui_meta_value(None).reason == "not-an-object"


# ─── Appendix D — Capability Registry ──────────────────────────────────────────

class TestAppendixDCapabilityRegistry:
  def test_enumerates_capabilities_with_sides_and_sections(self):
    for entry in CAPABILITY_REGISTRY:
      assert isinstance(entry, CapabilityRegistryEntry)
      assert len(entry.capability) > 0
      assert entry.side in CAPABILITY_SIDES
      assert entry.defined_in.startswith("§")
      for flag in entry.sub_flags:
        assert isinstance(flag, CapabilitySubFlag)

  def test_extensions_appears_on_both_sides_and_lookup_disambiguates(self):
    client = lookup_capability("extensions", "client")
    server = lookup_capability("extensions", "server")
    assert client is not None and client.side == "client"
    assert server is not None and server.side == "server"

  def test_lookup_without_side_returns_first_match(self):
    # extensions (client) is declared before extensions (server).
    first = lookup_capability("extensions")
    assert first is not None
    assert first.side == "client"

  def test_ac_46_13_elicitation_form_optional_url_other_mode(self):
    form = lookup_capability_sub_flag("elicitation", "form", "client")
    assert form is not None
    assert form.requirement == "optional"
    assert "url mode" in form.gates

  def test_ac_46_14_sampling_tools_and_context_optional_context_deprecated(self):
    sampling = lookup_capability("sampling", "client")
    assert sampling is not None
    assert sampling.deprecated is True
    tools = lookup_capability_sub_flag("sampling", "tools", "client")
    context = lookup_capability_sub_flag("sampling", "context", "client")
    assert tools is not None
    assert tools.requirement == "optional"
    assert "tools/toolChoice" in tools.gates
    assert context is not None
    assert context.requirement == "optional"
    assert context.deprecated is True
    assert "includeContext" in context.gates

  def test_ac_46_15_tools_list_changed_optional_boolean(self):
    flag = lookup_capability_sub_flag("tools", "listChanged", "server")
    assert flag is not None
    assert flag.requirement == "optional"
    assert flag.boolean is True

  def test_ac_46_16_resources_list_changed_and_subscribe_optional_booleans(self):
    list_changed = lookup_capability_sub_flag("resources", "listChanged", "server")
    subscribe = lookup_capability_sub_flag("resources", "subscribe", "server")
    assert list_changed is not None
    assert list_changed.requirement == "optional"
    assert list_changed.boolean is True
    assert subscribe is not None
    assert subscribe.requirement == "optional"
    assert subscribe.boolean is True

  def test_ac_46_17_prompts_list_changed_optional_boolean(self):
    flag = lookup_capability_sub_flag("prompts", "listChanged", "server")
    assert flag is not None
    assert flag.requirement == "optional"
    assert flag.boolean is True

  def test_empty_and_deprecated_capabilities(self):
    roots = lookup_capability("roots", "client")
    assert roots is not None
    assert roots.deprecated is True
    assert roots.sub_flags == ()
    completions = lookup_capability("completions", "server")
    assert completions is not None
    assert completions.sub_flags == ()
    logging = lookup_capability("logging", "server")
    assert logging is not None
    assert logging.deprecated is True
    tasks = lookup_capability("io.modelcontextprotocol/tasks")
    assert tasks is not None
    assert tasks.side == "client and server"

  def test_extension_capabilities_flagged_as_extension(self):
    tasks = lookup_capability("io.modelcontextprotocol/tasks")
    ui = lookup_capability("io.modelcontextprotocol/ui")
    assert tasks is not None and tasks.extension is True
    assert ui is not None and ui.extension is True
    # Non-extension capabilities default to extension=False.
    tools = lookup_capability("tools", "server")
    assert tools is not None and tools.extension is False

  def test_lookup_capability_unknown_returns_none(self):
    assert lookup_capability("nope") is None
    assert lookup_capability("tools", "client") is None  # tools is server-side only

  def test_lookup_capability_sub_flag_unknown_returns_none(self):
    assert lookup_capability_sub_flag("tools", "doesNotExist", "server") is None
    assert lookup_capability_sub_flag("nope", "listChanged") is None
    # roots has no sub-flags.
    assert lookup_capability_sub_flag("roots", "anything", "client") is None


# ─── Appendix E — Consolidated Type Index ──────────────────────────────────────

class TestAppendixETypeIndex:
  def test_lists_every_wire_type_with_section_and_purpose(self):
    assert len(TYPE_REGISTRY) == 176
    for entry in TYPE_REGISTRY:
      assert isinstance(entry, TypeIndexEntry)
      assert len(entry.type) > 0
      assert entry.defined_in.startswith("§")
      assert len(entry.purpose) > 0

  def test_type_index_matches_golden_list(self):
    # Golden cross-check: the full ordered type set. An exact count catches drops; this
    # additionally catches a renamed or reordered row. (A bare ``> 100`` guard would not
    # catch dropping ~50 of the 176 rows.)
    assert tuple(e.type for e in TYPE_REGISTRY) == _GOLDEN_TYPE_NAMES

  def test_mirrors_published_order_broadly_alphabetical_by_first_letter(self):
    first_letters = [e.type[0].lower() for e in TYPE_REGISTRY]
    for i in range(1, len(first_letters)):
      assert first_letters[i] >= first_letters[i - 1]
    # Sanity: the index opens at 'Annotations' and closes at 'WorkingTask'.
    assert TYPE_REGISTRY[0].type == "Annotations"
    assert TYPE_REGISTRY[-1].type == "WorkingTask"

  def test_has_no_duplicate_type_names(self):
    names = [e.type for e in TYPE_REGISTRY]
    assert len(set(names)) == len(names)

  def test_lookup_representative_type_and_reject_unknown(self):
    call_tool = lookup_type("CallToolResult")
    assert call_tool is not None
    assert "tools/call" in call_tool.defined_in
    assert lookup_type("NotARealType") is None

  def test_lookup_type_is_case_sensitive(self):
    assert lookup_type("Annotations") is not None
    assert lookup_type("annotations") is None
