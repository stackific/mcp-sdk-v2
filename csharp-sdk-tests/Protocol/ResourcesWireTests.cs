using System.Text.Json.Nodes;

using Stackific.Mcp;
using Stackific.Mcp.JsonRpc;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Exhaustive wire-shape coverage for the Resources server feature (spec §17): the concrete
/// <see cref="Resource"/>, the <see cref="ResourceTemplate"/> family, the cacheable
/// <see cref="ReadResourceResult"/> (text and blob contents), the paginated list results, and
/// the <see cref="ResourceUpdatedNotificationParams"/> notification payload.
/// </summary>
public sealed class ResourcesWireTests
{
  // ---- Resource: required + optional fields -------------------------------------------------

  [Fact]
  public void Resource_serializes_required_uri_and_name()
  {
    var json = McpJson.Serialize(new Resource { Uri = "docs://readme", Name = "readme" });
    Assert.Contains("\"uri\":\"docs://readme\"", json);
    Assert.Contains("\"name\":\"readme\"", json);
  }

  [Fact]
  public void Resource_omits_optional_fields_when_null()
  {
    var json = McpJson.Serialize(new Resource { Uri = "u", Name = "n" });

    Assert.DoesNotContain("\"title\"", json);
    Assert.DoesNotContain("\"description\"", json);
    Assert.DoesNotContain("\"mimeType\"", json);
    Assert.DoesNotContain("\"size\"", json);
    Assert.DoesNotContain("\"annotations\"", json);
    Assert.DoesNotContain("\"icons\"", json);
    Assert.DoesNotContain("\"_meta\"", json);
  }

  [Theory]
  [InlineData("docs://readme")]
  [InlineData("file:///etc/hosts")]
  [InlineData("weather://oslo/current")]
  [InlineData("https://example.com/x")]
  public void Resource_uri_round_trips_verbatim(string uri)
  {
    var back = McpJson.Deserialize<Resource>(McpJson.Serialize(new Resource { Uri = uri, Name = "n" }))!;
    Assert.Equal(uri, back.Uri);
  }

  [Theory]
  [InlineData("Readme")]
  [InlineData("Project File")]
  public void Resource_title_serializes_when_set(string title)
  {
    var json = McpJson.Serialize(new Resource { Uri = "u", Name = "n", Title = title });
    Assert.Contains($"\"title\":\"{title}\"", json);
  }

  [Fact]
  public void Resource_description_serializes_when_set()
  {
    var json = McpJson.Serialize(new Resource { Uri = "u", Name = "n", Description = "The project readme." });
    Assert.Contains("\"description\":\"The project readme.\"", json);
  }

  [Theory]
  [InlineData("text/markdown")]
  [InlineData("application/json")]
  [InlineData("image/png")]
  public void Resource_mime_type_serializes_when_set(string mime)
  {
    var json = McpJson.Serialize(new Resource { Uri = "u", Name = "n", MimeType = mime });
    Assert.Contains($"\"mimeType\":\"{mime}\"", json);
  }

  [Theory]
  [InlineData(0L)]
  [InlineData(42L)]
  [InlineData(1048576L)]
  public void Resource_size_serializes_and_round_trips(long size)
  {
    var json = McpJson.Serialize(new Resource { Uri = "u", Name = "n", Size = size });
    Assert.Contains($"\"size\":{size}", json);

    var back = McpJson.Deserialize<Resource>(json)!;
    Assert.Equal(size, back.Size);
  }

  [Fact]
  public void Resource_annotations_serialize_audience_and_priority()
  {
    var resource = new Resource
    {
      Uri = "u",
      Name = "n",
      Annotations = new Annotations { Audience = [Role.User], Priority = 0.5 },
    };
    var json = McpJson.Serialize(resource);

    Assert.Contains("\"audience\":[\"user\"]", json);
    Assert.Contains("\"priority\":0.5", json);
  }

  [Fact]
  public void Resource_icons_serialize()
  {
    var resource = new Resource
    {
      Uri = "u",
      Name = "n",
      Icons = [new Icon { Src = "https://x/i.svg", MimeType = "image/svg+xml" }],
    };
    var json = McpJson.Serialize(resource);
    Assert.Contains("\"src\":\"https://x/i.svg\"", json);
  }

  [Fact]
  public void Resource_meta_serializes_under_underscore_meta()
  {
    var json = McpJson.Serialize(new Resource { Uri = "u", Name = "n", Meta = new JsonObject { ["k"] = 1 } });
    Assert.Contains("\"_meta\":{\"k\":1}", json);
  }

  [Fact]
  public void Resource_round_trips_with_every_field()
  {
    var resource = new Resource
    {
      Uri = "docs://readme",
      Name = "readme",
      Title = "Readme",
      Description = "desc",
      MimeType = "text/markdown",
      Size = 100,
      Annotations = new Annotations { Priority = 1.0 },
      Icons = [new Icon { Src = "https://x/i.png" }],
      Meta = new JsonObject { ["x"] = true },
    };
    var back = McpJson.Deserialize<Resource>(McpJson.Serialize(resource))!;

    Assert.Equal("docs://readme", back.Uri);
    Assert.Equal("readme", back.Name);
    Assert.Equal("Readme", back.Title);
    Assert.Equal("desc", back.Description);
    Assert.Equal("text/markdown", back.MimeType);
    Assert.Equal(100, back.Size);
    Assert.Equal(1.0, back.Annotations!.Priority);
    Assert.Equal("https://x/i.png", back.Icons![0].Src);
    Assert.True(back.Meta!["x"]!.GetValue<bool>());
  }

  // ---- ResourceTemplate: uriTemplate + no size ----------------------------------------------

  [Fact]
  public void Resource_template_serializes_uri_template_and_name()
  {
    var json = McpJson.Serialize(new ResourceTemplate { UriTemplate = "weather://{city}/current", Name = "city-weather" });
    Assert.Contains("\"uriTemplate\":\"weather://{city}/current\"", json);
    Assert.Contains("\"name\":\"city-weather\"", json);
  }

  [Fact]
  public void Resource_template_has_no_size_field()
  {
    // ResourceTemplate has no Size property; serialization never emits "size".
    var template = new ResourceTemplate
    {
      UriTemplate = "x://{a}",
      Name = "n",
      Title = "T",
      Description = "d",
      MimeType = "application/json",
    };
    var json = McpJson.Serialize(template);
    Assert.DoesNotContain("\"size\"", json);
  }

  [Theory]
  [InlineData("weather://{city}/current")]
  [InlineData("file:///{path}")]
  [InlineData("db://{table}/{id}")]
  public void Resource_template_uri_template_round_trips(string uriTemplate)
  {
    var back = McpJson.Deserialize<ResourceTemplate>(
      McpJson.Serialize(new ResourceTemplate { UriTemplate = uriTemplate, Name = "n" }))!;
    Assert.Equal(uriTemplate, back.UriTemplate);
  }

  [Fact]
  public void Resource_template_omits_optional_fields_when_null()
  {
    var json = McpJson.Serialize(new ResourceTemplate { UriTemplate = "x://{a}", Name = "n" });
    Assert.DoesNotContain("\"title\"", json);
    Assert.DoesNotContain("\"description\"", json);
    Assert.DoesNotContain("\"mimeType\"", json);
    Assert.DoesNotContain("\"annotations\"", json);
    Assert.DoesNotContain("\"icons\"", json);
    Assert.DoesNotContain("\"_meta\"", json);
  }

  [Fact]
  public void Resource_template_round_trips_with_fields()
  {
    var template = new ResourceTemplate
    {
      UriTemplate = "weather://{city}/current",
      Name = "city-weather",
      Title = "City Weather",
      Description = "Per-city weather.",
      MimeType = "application/json",
      Annotations = new Annotations { Priority = 0.2 },
      Icons = [new Icon { Src = "https://x/w.png" }],
      Meta = new JsonObject { ["m"] = 1 },
    };
    var back = McpJson.Deserialize<ResourceTemplate>(McpJson.Serialize(template))!;

    Assert.Equal("weather://{city}/current", back.UriTemplate);
    Assert.Equal("city-weather", back.Name);
    Assert.Equal("City Weather", back.Title);
    Assert.Equal("Per-city weather.", back.Description);
    Assert.Equal("application/json", back.MimeType);
    Assert.Equal(0.2, back.Annotations!.Priority);
  }

  // ---- ReadResourceResult: text + blob contents ---------------------------------------------

  [Fact]
  public void Read_resource_result_serializes_text_contents()
  {
    var result = new ReadResourceResult
    {
      Contents = [ResourceContents.OfText("docs://readme", "# Readme", "text/markdown")],
    };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"contents\":[{", json);
    Assert.Contains("\"uri\":\"docs://readme\"", json);
    Assert.Contains("\"text\":\"# Readme\"", json);
    Assert.DoesNotContain("\"blob\"", json);
  }

  [Fact]
  public void Read_resource_result_serializes_blob_contents()
  {
    var result = new ReadResourceResult
    {
      Contents = [ResourceContents.OfBlob("img://logo", "QUJD", "image/png")],
    };
    var json = McpJson.Serialize(result);

    Assert.Contains("\"blob\":\"QUJD\"", json);
    Assert.DoesNotContain("\"text\"", json);
  }

  [Fact]
  public void Read_resource_result_mixes_text_and_blob_entries()
  {
    var result = new ReadResourceResult
    {
      Contents =
      [
        ResourceContents.OfText("u://t", "hello"),
        ResourceContents.OfBlob("u://b", "QUJD"),
      ],
    };
    var back = McpJson.Deserialize<ReadResourceResult>(McpJson.Serialize(result))!;

    Assert.Equal("hello", back.Contents[0].Text);
    Assert.Null(back.Contents[0].Blob);
    Assert.Equal("QUJD", back.Contents[1].Blob);
    Assert.Null(back.Contents[1].Text);
  }

  [Fact]
  public void Read_resource_result_validated_rejects_missing_cache_fields()
  {
    // §13.1/§13.4: a server MUST carry BOTH caching hints on a resources/read result. The emit-side
    // guard rejects a result that omits them. (This guard is NOT applied on receipt — see the
    // tolerance test below; a receiver degrades per §3.6/§13.1 rather than throwing.)
    var result = new ReadResourceResult { Contents = [ResourceContents.OfText("u", "t")] };
    Assert.Throws<ArgumentException>(() => result.Validated());
  }

  [Fact]
  public void Read_resource_result_validated_rejects_negative_ttl()
  {
    // §13.2: ttlMs MUST be a non-negative integer.
    var result = new ReadResourceResult
    {
      Contents = [ResourceContents.OfText("u", "t")],
      TtlMs = -1,
      CacheScope = CacheScope.Private,
    };
    Assert.Throws<ArgumentException>(() => result.Validated());
  }

  [Fact]
  public void Read_resource_result_validated_rejects_non_complete_result_type()
  {
    // §3.6: a completed read result's discriminator MUST be "complete" on emit.
    var result = new ReadResourceResult
    {
      Contents = [ResourceContents.OfText("u", "t")],
      ResultType = ResultTypes.InputRequired,
      TtlMs = 0,
      CacheScope = CacheScope.Private,
    };
    Assert.Throws<ArgumentException>(() => result.Validated());
  }

  [Fact]
  public void Read_resource_result_receive_tolerates_missing_fields_and_defaults_result_type()
  {
    // §3.6 / §13.1 receiver degradation: an inbound result that omits resultType and both caching hints
    // deserializes successfully — resultType defaults to "complete" (the §3.6 absent-⇒-complete rule),
    // and the hints stay absent so the receiver treats the result as immediately stale, NOT as an error.
    var back = McpJson.Deserialize<ReadResourceResult>("""{"contents":[{"uri":"u","text":"t"}]}""")!;
    Assert.Equal(ResultTypes.Complete, back.ResultType);
    Assert.Null(back.TtlMs);
    Assert.Null(back.CacheScope);
  }

  [Fact]
  public void Read_resource_result_serializes_result_type_complete()
  {
    var json = McpJson.Serialize(new ReadResourceResult
    {
      Contents = [ResourceContents.OfText("u", "t")],
      TtlMs = 0,
      CacheScope = CacheScope.Private,
    });
    Assert.Contains("\"resultType\":\"complete\"", json);
  }

  [Theory]
  [InlineData(0L, CacheScope.Public, "\"ttlMs\":0", "\"cacheScope\":\"public\"")]
  [InlineData(5000L, CacheScope.Private, "\"ttlMs\":5000", "\"cacheScope\":\"private\"")]
  public void Read_resource_result_cache_fields_serialize(long ttl, CacheScope scope, string ttlExpected, string scopeExpected)
  {
    var result = new ReadResourceResult
    {
      Contents = [ResourceContents.OfText("u", "t")],
      TtlMs = ttl,
      CacheScope = scope,
    };
    var json = McpJson.Serialize(result);

    Assert.Contains(ttlExpected, json);
    Assert.Contains(scopeExpected, json);
  }

  [Fact]
  public void Read_resource_result_round_trips_with_cache_fields()
  {
    var result = new ReadResourceResult
    {
      Contents = [ResourceContents.OfText("docs://x", "body", "text/plain")],
      TtlMs = 1234,
      CacheScope = CacheScope.Public,
    };
    var back = McpJson.Deserialize<ReadResourceResult>(McpJson.Serialize(result))!;

    Assert.Equal("body", back.Contents[0].Text);
    Assert.Equal("text/plain", back.Contents[0].MimeType);
    Assert.Equal(1234, back.TtlMs);
    Assert.Equal(CacheScope.Public, back.CacheScope);
  }

  [Fact]
  public void Resource_contents_meta_serializes()
  {
    var contents = new ResourceContents { Uri = "u", Text = "t", Meta = new JsonObject { ["k"] = "v" } };
    var json = McpJson.Serialize(contents);
    Assert.Contains("\"_meta\":{\"k\":\"v\"}", json);
  }

  // ---- ListResourcesResult ------------------------------------------------------------------

  [Fact]
  public void List_resources_result_serializes_resources_array()
  {
    var result = new ListResourcesResult { Resources = [new Resource { Uri = "u", Name = "n" }] };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"resources\":[{", json);
  }

  [Fact]
  public void List_resources_result_allows_empty()
  {
    var json = McpJson.Serialize(new ListResourcesResult { Resources = [] });
    Assert.Contains("\"resources\":[]", json);
  }

  [Theory]
  [InlineData("next-1")]
  [InlineData("p2==")]
  public void List_resources_result_next_cursor_round_trips(string cursor)
  {
    var back = McpJson.Deserialize<ListResourcesResult>(
      McpJson.Serialize(new ListResourcesResult { Resources = [], NextCursor = cursor }))!;
    Assert.Equal(cursor, back.NextCursor);
  }

  [Theory]
  [InlineData(CacheScope.Public, "\"cacheScope\":\"public\"")]
  [InlineData(CacheScope.Private, "\"cacheScope\":\"private\"")]
  public void List_resources_result_cache_scope_serializes(CacheScope scope, string expected)
  {
    var json = McpJson.Serialize(new ListResourcesResult { Resources = [], TtlMs = 1, CacheScope = scope });
    Assert.Contains(expected, json);
    Assert.Contains("\"ttlMs\":1", json);
  }

  [Fact]
  public void List_resources_result_validated_rejects_missing_cache_fields()
  {
    // §17.2/§13: a resources/list result MUST carry both caching hints on emit.
    Assert.Throws<ArgumentException>(() => new ListResourcesResult { Resources = [] }.Validated());
  }

  [Fact]
  public void List_resources_result_receive_tolerates_missing_fields()
  {
    // §3.6/§13.1: an inbound list result that omits resultType and the caching hints deserializes,
    // with resultType degrading to "complete".
    var back = McpJson.Deserialize<ListResourcesResult>("""{"resources":[]}""")!;
    Assert.Equal(ResultTypes.Complete, back.ResultType);
    Assert.Null(back.TtlMs);
    Assert.Null(back.CacheScope);
  }

  // ---- ListResourceTemplatesResult ----------------------------------------------------------

  [Fact]
  public void List_resource_templates_result_uses_resource_templates_key()
  {
    var result = new ListResourceTemplatesResult
    {
      ResourceTemplates = [new ResourceTemplate { UriTemplate = "x://{a}", Name = "n" }],
    };
    var json = McpJson.Serialize(result);
    Assert.Contains("\"resourceTemplates\":[{", json);
    Assert.Contains("\"uriTemplate\":\"x://{a}\"", json);
  }

  [Fact]
  public void List_resource_templates_result_allows_empty()
  {
    var json = McpJson.Serialize(new ListResourceTemplatesResult { ResourceTemplates = [] });
    Assert.Contains("\"resourceTemplates\":[]", json);
  }

  [Fact]
  public void List_resource_templates_result_round_trips_with_cache_fields()
  {
    var result = new ListResourceTemplatesResult
    {
      ResourceTemplates = [new ResourceTemplate { UriTemplate = "weather://{city}/current", Name = "cw" }],
      NextCursor = "c",
      TtlMs = 60000,
      CacheScope = CacheScope.Private,
    };
    var back = McpJson.Deserialize<ListResourceTemplatesResult>(McpJson.Serialize(result))!;

    Assert.Equal("weather://{city}/current", back.ResourceTemplates[0].UriTemplate);
    Assert.Equal("c", back.NextCursor);
    Assert.Equal(60000, back.TtlMs);
    Assert.Equal(CacheScope.Private, back.CacheScope);
  }

  [Fact]
  public void List_resource_templates_result_validated_rejects_missing_cache_fields()
  {
    // §17.3/§13: a resources/templates/list result MUST carry both caching hints on emit.
    Assert.Throws<ArgumentException>(() => new ListResourceTemplatesResult { ResourceTemplates = [] }.Validated());
  }

  // ---- ResourceUpdatedNotificationParams ----------------------------------------------------

  [Theory]
  [InlineData("docs://readme")]
  [InlineData("weather://oslo/current")]
  [InlineData("file:///tmp/x")]
  public void Resource_updated_notification_carries_uri(string uri)
  {
    var json = McpJson.Serialize(new ResourceUpdatedNotificationParams { Uri = uri });
    Assert.Contains($"\"uri\":\"{uri}\"", json);

    var back = McpJson.Deserialize<ResourceUpdatedNotificationParams>(json)!;
    Assert.Equal(uri, back.Uri);
  }

  [Fact]
  public void Resource_updated_notification_has_only_uri()
  {
    var json = McpJson.Serialize(new ResourceUpdatedNotificationParams { Uri = "u" });
    Assert.Equal("{\"uri\":\"u\"}", json);
  }

  // ---- RFC3986 / RFC6570 validation surface (§17.4) ----------------------------------------

  [Theory]
  [InlineData("docs://readme", true)]
  [InlineData("file:///etc/hosts", true)]
  [InlineData("urn:isbn:0451450523", true)]
  [InlineData("README.md", false)]
  [InlineData("/abs/path", false)]
  [InlineData("", false)]
  public void Resources_is_resource_uri(string uri, bool expected)
  {
    Assert.Equal(expected, Resources.IsResourceUri(uri));
  }

  [Theory]
  [InlineData("weather://{city}/current", true)]
  [InlineData("db://{table}/{id}", true)]
  [InlineData("file:///fixed", true)]
  [InlineData("db://{table", false)]
  [InlineData("db://{}/x", false)]
  public void Resources_is_uri_template(string template, bool expected)
  {
    Assert.Equal(expected, Resources.IsUriTemplate(template));
  }

  [Fact]
  public void Resources_uri_template_variables_lists_names()
  {
    Assert.Equal(new[] { "table", "id" }, Resources.UriTemplateVariables("db://{table}/{id}"));
  }

  // ---- Not-found code model: modern -32602 + legacy -32002 (§17.6, R-17.6-c) ----------------

  [Fact]
  public void Resource_not_found_codes_include_modern_and_legacy()
  {
    Assert.Equal(ErrorCodes.InvalidParams, Resources.ResourceNotFoundCode);
    Assert.Equal(-32002, Resources.LegacyResourceNotFoundCode);
    Assert.True(Resources.IsResourceNotFoundCode(ErrorCodes.InvalidParams));
    Assert.True(Resources.IsResourceNotFoundCode(-32002)); // legacy accepted by a client
    Assert.False(Resources.IsResourceNotFoundCode(ErrorCodes.InternalError));
  }

  [Fact]
  public void Build_resource_not_found_error_is_minus_32602_with_uri()
  {
    var error = Resources.BuildResourceNotFoundError("docs://missing");
    Assert.Equal(ErrorCodes.InvalidParams, error.Code);
    Assert.Equal("docs://missing", error.ErrorData!["uri"]!.GetValue<string>());
  }

  // ---- Empty-contents guard (§17.5, R-17.5-z) ----------------------------------------------

  [Fact]
  public void Guard_non_empty_contents_throws_internal_error_on_empty()
  {
    var result = new ReadResourceResult { Contents = [] };
    var error = Assert.Throws<McpError>(() => Resources.GuardNonEmptyContents(result, "docs://x"));
    Assert.Equal(ErrorCodes.InternalError, error.Code);
  }

  [Fact]
  public void Guard_non_empty_contents_passes_with_contents()
  {
    var result = new ReadResourceResult { Contents = [ResourceContents.OfText("docs://x", "body")] };
    Resources.GuardNonEmptyContents(result, "docs://x"); // does not throw
  }

  // ---- discriminateReadResourceResponse (§17.5) --------------------------------------------

  [Fact]
  public void Discriminate_read_response_absent_result_type_is_complete()
  {
    var response = Obj("""{"contents":[{"uri":"docs://x","text":"body"}]}""");
    var outcome = Resources.DiscriminateReadResourceResponse(response);
    Assert.Equal(ReadResourceResponseKind.Complete, outcome.Kind);
    Assert.Equal("body", outcome.Result!.Contents[0].Text);
  }

  [Fact]
  public void Discriminate_read_response_input_required_branch()
  {
    var response = Obj("""{"resultType":"input_required","requestState":"opaque"}""");
    var outcome = Resources.DiscriminateReadResourceResponse(response);
    Assert.Equal(ReadResourceResponseKind.InputRequired, outcome.Kind);
    Assert.Equal("opaque", outcome.InputRequired!.RequestState);
  }

  [Fact]
  public void Discriminate_read_response_unknown_result_type_is_error()
  {
    var response = Obj("""{"resultType":"partial","contents":[]}""");
    var outcome = Resources.DiscriminateReadResourceResponse(response);
    Assert.Equal(ReadResourceResponseKind.Error, outcome.Kind);
  }

  private static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();
}
