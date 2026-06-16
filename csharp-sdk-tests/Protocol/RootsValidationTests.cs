using Stackific.Mcp;
using Stackific.Mcp.Protocol;

namespace Stackific.Mcp.Tests.Protocol;

/// <summary>
/// Behavioral tests for §21.1 Roots validation — the <c>file://</c> + RFC 3986 <c>uri</c> constraint
/// (R-21.1.5-b/d), the path-traversal guard (R-21.1.5-i), the consent/scope assembly pipeline
/// (R-21.1.5-g/h), the non-<c>file</c>-scheme disposition (R-21.1.5-c), and the server-side
/// derived-path containment check (R-21.1.5-k). Mirrors the TypeScript <c>roots.test.ts</c> scenarios.
/// </summary>
public sealed class RootsValidationTests
{
  private const string FileUri = "file:///home/user/projects/myproject";

  // ── isValidFileUri (AC-32.11 · R-21.1.5-b/d) ──

  [Theory]
  [InlineData("file:///home/user/projects/myproject")]
  [InlineData("file:///")]
  public void Valid_file_uris_are_accepted(string uri)
  {
    Assert.True(RootsValidation.IsValidFileUri(uri));
  }

  [Theory]
  [InlineData("http://example.com")]
  [InlineData("https://example.com/a")]
  [InlineData("ftp://host/x")]
  [InlineData("not-a-uri")]
  [InlineData("relative/path")]
  [InlineData("")]
  [InlineData(null)]
  public void Non_file_or_malformed_uris_are_rejected(string? uri)
  {
    Assert.False(RootsValidation.IsValidFileUri(uri));
  }

  [Fact]
  public void A_root_with_an_invalid_uri_is_rejected()
  {
    Assert.True(RootsValidation.IsValidRoot(new Root { Uri = FileUri }));
    Assert.False(RootsValidation.IsValidRoot(new Root { Uri = "http://example.com" }));
  }

  // ── Strict ListRootsResult validation (AC-32.10, AC-32.11) ──

  [Fact]
  public void Strict_list_roots_result_accepts_empty_and_valid_arrays_rejects_invalid_uris()
  {
    Assert.True(RootsValidation.IsValidStrictListRootsResult(new ListRootsResult { Roots = [] }));
    Assert.True(RootsValidation.IsValidStrictListRootsResult(new ListRootsResult
    {
      Roots = [new Root { Uri = FileUri, Name = "My Project" }],
    }));
    Assert.False(RootsValidation.IsValidStrictListRootsResult(new ListRootsResult
    {
      Roots = [new Root { Uri = "http://x" }],
    }));
  }

  // ── Path-traversal guard (AC-32.16 · R-21.1.5-i) ──

  [Theory]
  [InlineData("file:///home/user/../etc/passwd")]
  [InlineData("file:///a/b/..")]
  [InlineData("file:///home/%2e%2e/etc")]
  [InlineData("file:///home/%2E%2E/etc")]
  public void Path_traversal_artifacts_are_flagged_unsafe(string uri)
  {
    Assert.False(RootsValidation.IsPathTraversalSafe(uri));
  }

  [Fact]
  public void A_clean_file_path_is_traversal_safe()
  {
    Assert.True(RootsValidation.IsPathTraversalSafe("file:///home/user/projects/myproject"));
  }

  [Fact]
  public void A_non_file_uri_is_not_traversal_safe()
  {
    Assert.False(RootsValidation.IsPathTraversalSafe("http://x"));
  }

  // ── roots/list method (AC-32.8 · R-21.1.4-a) ──

  [Theory]
  [InlineData("roots/list", true)]
  [InlineData("Roots/List", false)]
  [InlineData("roots/List", false)]
  [InlineData("ROOTS/LIST", false)]
  [InlineData("roots/get", false)]
  public void Is_roots_list_method_is_exact_and_case_sensitive(string method, bool expected)
  {
    Assert.Equal(expected, RootsValidation.IsRootsListMethod(method));
  }

  // ── listChanged non-existence (AC-32.5 · R-21.1.2-c) ──

  [Fact]
  public void Roots_list_changed_is_unsupported()
  {
    Assert.False(RootsValidation.RootsListChangedSupported);
    Assert.False(RootsValidation.MayRelyOnRootsListChanged());
    Assert.Equal("notifications/roots/list_changed", RootsValidation.RootsListChangedNotificationMethod);
  }

  // ── Non-file disposition (AC-32.12 · R-21.1.5-c) ──

  [Fact]
  public void Both_reject_and_ignore_are_conformant_dispositions()
  {
    Assert.True(RootsValidation.IsConformantNonFileDisposition(NonFileRootDisposition.Reject));
    Assert.True(RootsValidation.IsConformantNonFileDisposition(NonFileRootDisposition.Ignore));
  }

  [Fact]
  public void Apply_non_file_disposition_drops_non_file_under_either_disposition_keeps_file()
  {
    Assert.False(RootsValidation.ApplyNonFileDisposition("http://x", NonFileRootDisposition.Reject).Kept);
    Assert.False(RootsValidation.ApplyNonFileDisposition("http://x", NonFileRootDisposition.Ignore).Kept);
    Assert.True(RootsValidation.ApplyNonFileDisposition(FileUri, NonFileRootDisposition.Reject).Kept);
    Assert.True(RootsValidation.ApplyNonFileDisposition(FileUri, NonFileRootDisposition.Ignore).Kept);
  }

  // ── Client-side assembly (AC-32.15, AC-32.16) ──

  [Fact]
  public void Assembly_includes_only_in_scope_consented_roots_and_reports_exclusions()
  {
    var candidates = new List<RootCandidate>
    {
      new(new Root { Uri = "file:///a" }, Consented: true, InScope: true),
      new(new Root { Uri = "file:///b" }, Consented: true, InScope: false),
      new(new Root { Uri = "file:///c" }, Consented: false, InScope: true),
    };
    var assembly = RootsValidation.AssembleListRootsResult(candidates);

    Assert.Equal(["file:///a"], assembly.Result.Roots.Select(r => r.Uri));
    Assert.Contains(assembly.Excluded, e => e.Root.Uri == "file:///b" && e.Reason == RootExclusionReason.NotInScope);
    Assert.Contains(assembly.Excluded, e => e.Root.Uri == "file:///c" && e.Reason == RootExclusionReason.NoConsent);
  }

  [Fact]
  public void Assembly_excludes_traversal_and_invalid_uri_candidates()
  {
    var candidates = new List<RootCandidate>
    {
      new(new Root { Uri = "file:///home/../etc" }, Consented: true, InScope: true),
      new(new Root { Uri = "http://nope" }, Consented: true, InScope: true),
      new(new Root { Uri = "file:///home/user/ok" }, Consented: true, InScope: true),
    };
    var assembly = RootsValidation.AssembleListRootsResult(candidates);

    Assert.Equal(["file:///home/user/ok"], assembly.Result.Roots.Select(r => r.Uri));
    Assert.Contains(assembly.Excluded, e => e.Root.Uri == "file:///home/../etc" && e.Reason == RootExclusionReason.PathTraversal);
    Assert.Contains(assembly.Excluded, e => e.Root.Uri == "http://nope" && e.Reason == RootExclusionReason.InvalidUri);
  }

  [Fact]
  public void Assembly_produces_the_conformant_empty_listing_when_nothing_qualifies()
  {
    var candidates = new List<RootCandidate>
    {
      new(new Root { Uri = "file:///x" }, Consented: false, InScope: false),
    };
    Assert.Empty(RootsValidation.AssembleListRootsResult(candidates).Result.Roots);
  }

  // ── Server non-enforcement + path containment (AC-32.17, AC-32.18) ──

  [Fact]
  public void Server_tolerates_unavailable_roots_and_does_not_rely_on_protocol_enforcement()
  {
    Assert.True(RootsValidation.ShouldTolerateUnavailableRoot(new Root { Uri = FileUri }));
    Assert.False(RootsValidation.ProtocolEnforcesRootBoundaries);
    Assert.False(RootsValidation.ProtocolEnforcesRootBoundariesFn());
  }

  [Fact]
  public void Is_path_within_reported_roots_accepts_contained_and_rejects_sibling_paths()
  {
    var roots = new List<Root> { new() { Uri = "file:///home/user/project" } };
    Assert.True(RootsValidation.IsPathWithinReportedRoots("file:///home/user/project", roots));
    Assert.True(RootsValidation.IsPathWithinReportedRoots("file:///home/user/project/src/index.ts", roots));
    Assert.False(RootsValidation.IsPathWithinReportedRoots("file:///etc/passwd", roots));
    // Shares a prefix STRING but not a path segment.
    Assert.False(RootsValidation.IsPathWithinReportedRoots("file:///home/user/projectile", roots));
  }

  [Fact]
  public void Is_path_within_reported_roots_rejects_non_file_paths_and_skips_invalid_roots()
  {
    var roots = new List<Root> { new() { Uri = "file:///home/user/project" } };
    Assert.False(RootsValidation.IsPathWithinReportedRoots("http://x", roots));
    Assert.False(RootsValidation.IsPathWithinReportedRoots(
      "file:///home/user/project", [new Root { Uri = "http://bad" }]));
  }

  // ── §21.1 deprecation marking (RC-1/RC-2) + forward compatibility (RQ-11) ──

  [Fact]
  public void Root_is_marked_obsolete_and_names_the_preferred_mechanisms()
  {
    var obsolete = (ObsoleteAttribute?)Attribute.GetCustomAttribute(typeof(Root), typeof(ObsoleteAttribute));
    Assert.NotNull(obsolete);
    // The message steers developers to the modern alternatives (R-21.1.1-a/b).
    Assert.Contains("tool input parameters", obsolete!.Message);
    Assert.Contains("resource URIs", obsolete.Message);
    Assert.Contains("server configuration", obsolete.Message);
  }

  [Fact]
  public void List_roots_result_is_marked_obsolete()
  {
    var obsolete = (ObsoleteAttribute?)Attribute.GetCustomAttribute(typeof(ListRootsResult), typeof(ObsoleteAttribute));
    Assert.NotNull(obsolete);
    Assert.Contains("Deprecated", obsolete!.Message);
  }

  [Fact]
  public void A_root_tolerates_an_unknown_meta_member()
  {
    // §21.1.5-f / TV-32.13: an unrecognized _meta key is preserved, not rejected (forward compatibility).
    var back = McpJson.Deserialize<Root>("""{"uri":"file:///x","_meta":{"example.com/unknown":"value"}}""")!;
    Assert.True(RootsValidation.IsValidRoot(back));
    Assert.Equal("value", back.Meta!["example.com/unknown"]!.GetValue<string>());
  }
}
