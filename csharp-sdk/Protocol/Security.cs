using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

using Stackific.Mcp.JsonRpc;

namespace Stackific.Mcp.Protocol;

/// <summary>
/// S44 — Security Considerations (spec §28).
/// </summary>
/// <remarks>
/// <para>
/// The cross-cutting security and trust model every conforming MCP implementation MUST honor. §28 is a
/// consolidating section: it defines no new wire types but binds together the most critical obligations
/// introduced piecemeal alongside individual features. The protocol cannot enforce most of these at the
/// wire level, so conformance depends on implementations honoring them. This module models them as a
/// registry of every numbered §28 requirement atom (<see cref="Security.Requirements"/>), predicates
/// and validators for the obligations that are checkable in code (consent gating, trust
/// classification, token handling, continuation-token integrity, input/URI/cursor validation, resource
/// bounds), and a four-principle baseline checklist (<see cref="Security.AssessBaseline"/>).
/// </para>
/// <para>
/// The TypeScript SDK delegates several validators to per-feature modules (S25 tools, S33 sampling, S37
/// authorization, S42 UI host, S18 pagination). Where those modules have no C# counterpart yet, the
/// small, deterministic mechanics they own (audience/issuer matching, schema validation, control-char
/// stripping, file-path normalization, SSRF host classification) are reproduced here so the §28 surface
/// is self-contained and behaviorally faithful.
/// </para>
/// </remarks>
public static class Security
{
  // ─── §28 requirement registry ───────────────────────────────────────────────────

  /// <summary>The four §28.1 core security principles every conforming implementation is built around (spec R-28.1-a).</summary>
  public static IReadOnlyList<string> Principles { get; } =
    ["user-consent-and-control", "data-privacy", "tool-safety", "host-mediated-trust"];

  /// <summary>A single normative §28 requirement, as consolidated by S44.</summary>
  /// <param name="Id">The requirement-atom id, e.g. <c>R-28.3-g</c>.</param>
  /// <param name="Level">Its normative strength (<c>MUST</c>/<c>MUST NOT</c>/<c>SHOULD</c>/<c>MAY</c>).</param>
  /// <param name="Section">The §28 subsection that states it, e.g. <c>§28.3</c>.</param>
  /// <param name="Principle">The core principle it derives from (§28.1).</param>
  /// <param name="Statement">A concise restatement of the obligation.</param>
  public sealed record SecurityRequirement(string Id, string Level, string Section, string Principle, string Statement);

  /// <summary>
  /// Every numbered §28 requirement atom, in spec order — the single enumerable security baseline an
  /// implementation must address (spec R-28-a, and every R-28.x-y). Each atom id is used throughout the
  /// per-feature modules so a reviewer can trace an obligation to the code that enforces it.
  /// </summary>
  public static IReadOnlyList<SecurityRequirement> Requirements { get; } =
  [
    // §28 overarching
    new("R-28-a", "MUST", "§28", "host-mediated-trust", "Address the security/trust obligations of arbitrary data access and code execution; the protocol cannot enforce them at the wire level."),
    // §28.1 core principles
    new("R-28.1-a", "MUST", "§28.1", "host-mediated-trust", "Be designed around the four core principles: user consent and control, data privacy, tool safety, host-mediated trust."),
    new("R-28.1-b", "MUST", "§28.1", "user-consent-and-control", "Users explicitly consent to, and understand, all data access and operations."),
    new("R-28.1-c", "MUST", "§28.1", "user-consent-and-control", "Users retain control over what data is shared and what actions are taken."),
    new("R-28.1-d", "SHOULD", "§28.1", "user-consent-and-control", "Provide clear interfaces for reviewing and authorizing activities."),
    new("R-28.1-e", "MUST", "§28.1", "data-privacy", "Obtain explicit user consent before exposing user data to a server."),
    new("R-28.1-f", "MUST NOT", "§28.1", "data-privacy", "Never transmit resource data elsewhere without user consent."),
    new("R-28.1-g", "SHOULD", "§28.1", "data-privacy", "Protect user data with appropriate access controls."),
    new("R-28.1-h", "MUST", "§28.1", "tool-safety", "Treat tools as arbitrary code execution requiring caution."),
    new("R-28.1-i", "MUST", "§28.1", "tool-safety", "Treat tool-behavior descriptions, including annotations, as untrusted unless from a trusted server."),
    new("R-28.1-j", "MUST", "§28.1", "tool-safety", "Obtain explicit user consent before invoking any tool."),
    new("R-28.1-k", "SHOULD", "§28.1", "host-mediated-trust", "Build robust consent/authorization flows, document implications, implement access controls and data protections."),
    // §28.2 user consent and control
    new("R-28.2-a", "MUST", "§28.2", "user-consent-and-control", "Obtain explicit consent before exposing user data or invoking a tool/elicitation/operation on the user’s behalf."),
    new("R-28.2-b", "MUST", "§28.2", "user-consent-and-control", "Consent is informed: the user is given enough information to understand it before authorizing."),
    new("R-28.2-c", "MUST", "§28.2", "user-consent-and-control", "Users can review and authorize activities and can decline them."),
    new("R-28.2-d", "MUST NOT", "§28.2", "user-consent-and-control", "Never treat absence of an explicit refusal as consent."),
    new("R-28.2-e", "MUST NOT", "§28.2", "user-consent-and-control", "Never silently escalate an already-granted consent to broader scope or a different operation."),
    new("R-28.2-f", "MUST", "§28.2", "user-consent-and-control", "Seek fresh consent where an operation differs materially from one already authorized."),
    new("R-28.2-g", "SHOULD", "§28.2", "user-consent-and-control", "Present consent prompts in a form that cannot be spoofed by server-provided content."),
    // §28.3 tool safety
    new("R-28.3-a", "MUST", "§28.3", "tool-safety", "Treat a tool invocation as a request to execute arbitrary code with effects the host cannot predict."),
    new("R-28.3-b", "MUST", "§28.3", "tool-safety", "Treat tool definitions (names, descriptions, schemas, annotations) as untrusted unless from a trusted server."),
    new("R-28.3-c", "MUST NOT", "§28.3", "tool-safety", "Never rely on a tool annotation (e.g. read-only/non-destructive hint) as a security guarantee."),
    new("R-28.3-d", "MUST", "§28.3", "tool-safety", "Keep a human in the loop: the user can review, understand, and deny a proposed invocation before it runs."),
    new("R-28.3-e", "MUST NOT", "§28.3", "tool-safety", "The decision to invoke a tool never rests solely with the model."),
    new("R-28.3-f", "SHOULD", "§28.3", "tool-safety", "Guard against prompt-injection content reaching the model via descriptions, results, or resource contents."),
    new("R-28.3-g", "MUST", "§28.3", "tool-safety", "A server rate-limits tools/call invocations."),
    new("R-28.3-h", "MUST", "§28.3", "tool-safety", "Reject a tools/call that exceeds the rate limit rather than executing it."),
    new("R-28.3-i", "MUST", "§28.3", "tool-safety", "Sanitize tool outputs before returning them."),
    new("R-28.3-j", "SHOULD", "§28.3", "tool-safety", "A client shows the tool’s arguments to the user before issuing the call."),
    new("R-28.3-k", "SHOULD", "§28.3", "tool-safety", "A client applies a per-call timeout and surfaces a failure when it elapses."),
    new("R-28.3-l", "SHOULD", "§28.3", "tool-safety", "A client logs tool usage for audit, observing §28.9 (never logging credentials/tokens)."),
    // §28.4 data privacy and isolation
    new("R-28.4-a", "MUST", "§28.4", "data-privacy", "A server receives only the context the host elects to share."),
    new("R-28.4-b", "MUST NOT", "§28.4", "data-privacy", "Never transmit resource/user data to a server or third party without consent."),
    new("R-28.4-c", "SHOULD", "§28.4", "data-privacy", "Protect user data with access controls commensurate with its sensitivity."),
    new("R-28.4-d", "MUST", "§28.4", "data-privacy", "Servers are isolated from one another."),
    new("R-28.4-e", "MUST NOT", "§28.4", "data-privacy", "One server can never observe the existence, data, or activity of another on the same host."),
    new("R-28.4-f", "MUST NOT", "§28.4", "data-privacy", "The host never relays one server’s requests/results/context/credentials to another."),
    // §28.5 authorization security (§23 authoritative)
    new("R-28.5-a", "MUST", "§28.5", "host-mediated-trust", "Satisfy the normative requirements of §23 Authorization when authorization is used."),
    new("R-28.5-b", "MUST", "§28.5", "host-mediated-trust", "A server validates that every token was issued for it as the intended audience."),
    new("R-28.5-c", "MUST", "§28.5", "host-mediated-trust", "A server rejects any token not in its audience or it cannot verify was intended for it."),
    new("R-28.5-d", "MUST", "§28.5", "host-mediated-trust", "A server validates a token before processing the request it accompanies."),
    new("R-28.5-e", "MUST NOT", "§28.5", "host-mediated-trust", "A server never returns data to an unauthorized party."),
    new("R-28.5-f", "MUST NOT", "§28.5", "host-mediated-trust", "A server never accepts a token issued for another resource nor forwards a client token upstream."),
    new("R-28.5-g", "MUST", "§28.5", "host-mediated-trust", "When a server calls an upstream API it uses a separate token from the upstream AS."),
    new("R-28.5-h", "MUST", "§28.5", "host-mediated-trust", "A client records the expected issuer before redirecting the user agent."),
    new("R-28.5-i", "MUST", "§28.5", "host-mediated-trust", "A client compares any returned issuer against the recorded value by exact string comparison and rejects mismatches."),
    new("R-28.5-j", "MUST", "§28.5", "host-mediated-trust", "A client uses PKCE with S256 where technically capable."),
    new("R-28.5-k", "MUST", "§28.5", "host-mediated-trust", "A client verifies via metadata that the server supports PKCE, refusing to proceed otherwise."),
    new("R-28.5-l", "SHOULD", "§28.5", "host-mediated-trust", "A client generates and verifies a state value in the authorization code flow."),
    new("R-28.5-m", "MUST", "§28.5", "host-mediated-trust", "A client discards any result whose state is absent or mismatched."),
    new("R-28.5-n", "MUST", "§28.5", "host-mediated-trust", "Clients and servers store tokens securely and keep refresh tokens confidential in transit and at rest."),
    new("R-28.5-o", "MUST NOT", "§28.5", "host-mediated-trust", "Tokens are never logged."),
    new("R-28.5-p", "MUST NOT", "§28.5", "host-mediated-trust", "Tokens are never forwarded to any party other than the one they were issued for."),
    new("R-28.5-q", "MUST", "§28.5", "host-mediated-trust", "Authorization-server endpoints and redirect URIs use HTTPS (localhost redirect permitted)."),
    // §28.6 multi-round-trip & continuation safety
    new("R-28.6-a", "MUST", "§28.6", "host-mediated-trust", "A server protects integrity and confidentiality of the requestState continuation token."),
    new("R-28.6-b", "MUST", "§28.6", "host-mediated-trust", "A receiver rejects a continuation token that fails integrity validation rather than acting on it."),
    new("R-28.6-c", "SHOULD", "§28.6", "host-mediated-trust", "Servers guard against replay of continuation tokens (single-use/session/operation binding, time-bounded)."),
    // §28.7 elicitation & sampling consent
    new("R-28.7-a", "MUST", "§28.7", "user-consent-and-control", "Server-initiated elicitation and server-driven model output remain under user control."),
    new("R-28.7-b", "MUST", "§28.7", "user-consent-and-control", "For elicitation, the user can review and approve/edit/decline/cancel before anything returns to the server."),
    new("R-28.7-c", "MUST", "§28.7", "user-consent-and-control", "The user can decline or cancel an elicitation at any point."),
    new("R-28.7-d", "MUST NOT", "§28.7", "user-consent-and-control", "A server never uses elicitation to phish for credentials or secrets."),
    new("R-28.7-e", "SHOULD", "§28.7", "user-consent-and-control", "Clients show the requesting server’s identity and treat secret requests as suspect."),
    new("R-28.7-f", "MUST", "§28.7", "user-consent-and-control", "Sampling prompts and completions are subject to human review before being acted upon or transmitted."),
    new("R-28.7-g", "MUST NOT", "§28.7", "user-consent-and-control", "The host never discloses more conversation context to a sampling request than the user authorized."),
    // §28.8 UI sandboxing
    new("R-28.8-a", "MUST", "§28.8", "host-mediated-trust", "Render server-provided UI in an isolated sandbox under a restrictive content-security policy."),
    new("R-28.8-b", "MUST", "§28.8", "host-mediated-trust", "The host mediates every privileged action the UI requests."),
    new("R-28.8-c", "MUST", "§28.8", "host-mediated-trust", "A UI-requested tools/call is routed through the normal consent/human-in-the-loop path."),
    new("R-28.8-d", "MUST NOT", "§28.8", "host-mediated-trust", "The UI can never cause a tool to run without host mediation and user consent."),
    new("R-28.8-e", "MUST NOT", "§28.8", "host-mediated-trust", "The host never exposes credentials/tokens/unrelated context to the sandboxed content."),
    new("R-28.8-f", "MUST NOT", "§28.8", "host-mediated-trust", "The host never lets sandboxed content exfiltrate host/user state beyond what the policy permits."),
    new("R-28.8-g", "SHOULD", "§28.8", "host-mediated-trust", "Constrain the sandbox’s network/storage/scripting capabilities to the minimum required."),
    new("R-28.8-h", "SHOULD", "§28.8", "host-mediated-trust", "Ensure host-rendered consent/identity indicators cannot be spoofed or obscured by the sandbox."),
    // §28.9 metadata & observability
    new("R-28.9-a", "MUST NOT", "§28.9", "host-mediated-trust", "Never use any metadata value (trace ids, progress tokens) for authentication/authorization/access-control."),
    new("R-28.9-b", "SHOULD", "§28.9", "host-mediated-trust", "Validate the structure of consumed metadata and ignore values not understood."),
    new("R-28.9-c", "SHOULD", "§28.9", "data-privacy", "Avoid logging sensitive metadata or recording sensitive request/result content."),
    new("R-28.9-d", "MUST NOT", "§28.9", "host-mediated-trust", "Credentials and tokens are never logged."),
    new("R-28.9-e", "SHOULD", "§28.9", "data-privacy", "Minimize and redact observability data that may transit/store outside the trust boundary."),
    // §28.10 input validation & resource bounds
    new("R-28.10-a", "MUST", "§28.10", "tool-safety", "Validate all inputs accepted from a peer before acting on them."),
    new("R-28.10-b", "MUST NOT", "§28.10", "tool-safety", "Never assume a peer is well-behaved."),
    new("R-28.10-c", "MUST", "§28.10", "tool-safety", "A server validates tool-call arguments against the declared input schema before relying on them."),
    new("R-28.10-d", "SHOULD", "§28.10", "tool-safety", "A client validates structured results against a declared output schema before relying on them."),
    new("R-28.10-e", "MUST", "§28.10", "tool-safety", "Validation failures are reported as errors rather than acted upon."),
    new("R-28.10-f", "MUST", "§28.10", "data-privacy", "Validate resource URIs and URI templates before dereferencing or matching them."),
    new("R-28.10-g", "MUST NOT", "§28.10", "data-privacy", "Never follow a URI to a location the user has not authorized."),
    new("R-28.10-h", "SHOULD", "§28.10", "data-privacy", "Guard against SSRF where a URI could cause the receiver to issue a network request."),
    new("R-28.10-i", "MUST", "§28.10", "host-mediated-trust", "A server with an HTTP endpoint validates the Origin header on every connection (DNS-rebinding defense, §9.11)."),
    new("R-28.10-j", "MUST", "§28.10", "tool-safety", "A server treats a pagination cursor as opaque/untrusted, validates it, and rejects malformed/unknown/expired cursors."),
    new("R-28.10-k", "MUST", "§28.10", "tool-safety", "Bound resources consumed while validating inputs: schema nesting depth and validation time."),
    new("R-28.10-l", "SHOULD", "§28.10", "tool-safety", "Impose message/payload size limits and reject inputs that exceed them."),
    new("R-28.10-m", "MUST NOT", "§28.10", "tool-safety", "Never automatically dereference external schema references in a tool schema."),
    new("R-28.10-n", "MUST", "§28.10", "tool-safety", "Schemas are self-contained or resolved only against explicitly trusted sources."),
    new("R-28.10-o", "MUST", "§28.10", "data-privacy", "When serving file:// resources, sanitize file paths to prevent directory traversal."),
    new("R-28.10-p", "MUST NOT", "§28.10", "data-privacy", "Never serve a file outside the directories the user has authorized."),
  ];

  private static readonly IReadOnlyDictionary<string, SecurityRequirement> RequirementsById =
    Requirements.ToDictionary(r => r.Id, StringComparer.Ordinal);

  /// <summary>Looks up a §28 requirement atom by id (e.g. <c>R-28.5-b</c>), or <c>null</c> (spec R-28-a).</summary>
  /// <param name="id">The requirement-atom id.</param>
  /// <returns>The requirement, or <c>null</c>.</returns>
  public static SecurityRequirement? LookupRequirement(string id) =>
    RequirementsById.TryGetValue(id, out var r) ? r : null;

  /// <summary>Returns every §28 requirement that derives from a given core principle, in spec order (spec R-28.1-a).</summary>
  /// <param name="principle">One of the four core principles.</param>
  /// <returns>The per-principle slice of the baseline.</returns>
  public static IReadOnlyList<SecurityRequirement> RequirementsForPrinciple(string principle) =>
    Requirements.Where(r => string.Equals(r.Principle, principle, StringComparison.Ordinal)).ToList();

  /// <summary>Returns every MUST / MUST NOT requirement — the hard obligations conformance turns on (spec R-28-a).</summary>
  /// <returns>The mandatory requirements.</returns>
  public static IReadOnlyList<SecurityRequirement> MandatoryRequirements() =>
    Requirements.Where(r => r.Level is "MUST" or "MUST NOT").ToList();

  // ─── §28.1 — Core-principle baseline checklist (R-28.1-a; AC-44.1) ───────────────

  /// <summary>A host's self-assertion that it addresses each of the four §28.1 core principles (spec R-28.1-a; AC-44.1).</summary>
  /// <param name="UserConsentAndControl">Users explicitly consent to and control all data access/operations (R-28.1-b, R-28.1-c).</param>
  /// <param name="DataPrivacy">A server receives only host-elected context; no transmission without consent (R-28.1-e, R-28.1-f).</param>
  /// <param name="ToolSafety">Tools are treated as arbitrary code; definitions/annotations are untrusted (R-28.1-h, R-28.1-i).</param>
  /// <param name="HostMediatedTrust">Trust is mediated and enforced at the host, never delegated to a server (§28.1(4)).</param>
  public readonly record struct SecurityBaselineClaims(
    bool UserConsentAndControl, bool DataPrivacy, bool ToolSafety, bool HostMediatedTrust);

  /// <summary>Outcome of <see cref="AssessBaseline"/>.</summary>
  /// <param name="Ok"><c>true</c> when every principle is claimed.</param>
  /// <param name="UnmetPrinciples">The principles not claimed, in canonical order (empty when <paramref name="Ok"/> is <c>true</c>).</param>
  public readonly record struct SecurityBaselineAssessment(bool Ok, IReadOnlyList<string> UnmetPrinciples);

  /// <summary>
  /// Asserts that an implementation is designed around all four §28.1 core principles (spec R-28-a,
  /// R-28.1-a; AC-44.1). Returns <c>Ok</c> only when every principle is claimed; otherwise lists the
  /// unmet ones in canonical order.
  /// </summary>
  /// <param name="claims">The host's per-principle self-assertion.</param>
  /// <returns>The assessment.</returns>
  public static SecurityBaselineAssessment AssessBaseline(SecurityBaselineClaims claims)
  {
    var unmet = new List<string>();
    if (!claims.UserConsentAndControl) unmet.Add("user-consent-and-control");
    if (!claims.DataPrivacy) unmet.Add("data-privacy");
    if (!claims.ToolSafety) unmet.Add("tool-safety");
    if (!claims.HostMediatedTrust) unmet.Add("host-mediated-trust");
    return new SecurityBaselineAssessment(unmet.Count == 0, unmet);
  }

  // ─── §28.2 — User consent and control (R-28.2-a – R-28.2-g; AC-44.2/3/7) ──────────

  /// <summary>A record of the consent a user has explicitly granted for a single operation (spec §28.2).</summary>
  /// <param name="Operation">The operation the user authorized, e.g. a tool name or <c>resource-exposure</c>.</param>
  /// <param name="Scope">An opaque, comparable summary of WHAT was authorized; a materially different value requires fresh consent (R-28.2-e, R-28.2-f).</param>
  /// <param name="Informed"><c>true</c> when the user actively, informedly granted it (R-28.2-b).</param>
  public readonly record struct ConsentGrant(string Operation, string Scope, bool Informed);

  /// <summary>A proposed operation seeking the host's consent gate (spec §28.2).</summary>
  /// <param name="Operation">The operation being proposed.</param>
  /// <param name="Scope">The scope summary of the proposed operation, compared against any prior grant.</param>
  /// <param name="UserApproved">Whether the user has, for THIS proposal, actively and informedly granted consent; silence MUST NOT be <c>true</c> (R-28.2-d).</param>
  public readonly record struct ConsentRequest(string Operation, string Scope, bool? UserApproved = null);

  /// <summary>The §28.2 consent-gate decision reason.</summary>
  public enum ConsentReason
  {
    /// <summary>Allowed: matches a prior grant for the same operation and scope.</summary>
    MatchesPriorGrant,

    /// <summary>Allowed: the user freshly, informedly approved this proposal.</summary>
    FreshlyApproved,

    /// <summary>Denied: no prior grant and no fresh approval — absence of refusal is never consent (R-28.2-d).</summary>
    NoConsent,

    /// <summary>Denied: a fresh approval that is not informed (R-28.2-b).</summary>
    NotInformed,

    /// <summary>Denied: the operation differs materially from a prior grant (R-28.2-f).</summary>
    MaterialChange,

    /// <summary>Denied: a silent escalation of an existing grant's scope (R-28.2-e).</summary>
    SilentEscalation,
  }

  /// <summary>The §28.2 consent-gate decision.</summary>
  /// <param name="Allowed"><c>true</c> when the operation may proceed.</param>
  /// <param name="Reason">The decision reason.</param>
  /// <param name="Detail">A human-readable detail on a denial, or <c>null</c>.</param>
  public readonly record struct ConsentDecision(bool Allowed, ConsentReason Reason, string? Detail);

  /// <summary>
  /// The host consent gate every operation acting on the user's behalf passes before it reaches a server
  /// (spec §28.2, R-28.2-a … R-28.2-f; AC-44.2, AC-44.7). Allows the operation ONLY when it matches a
  /// prior grant for the SAME operation and scope, or the user freshly, informedly approved THIS
  /// proposal. Denies (with a reason) on no-consent, not-informed, or silent-escalation. The gate never
  /// treats a missing approval as approval.
  /// </summary>
  /// <param name="request">The proposed operation and whether it was freshly approved.</param>
  /// <param name="priorGrant">The consent already recorded for this operation, if any.</param>
  /// <returns>The consent decision.</returns>
  public static ConsentDecision EvaluateConsent(ConsentRequest request, ConsentGrant? priorGrant = null)
  {
    var matchesPrior = priorGrant is { } pg &&
      string.Equals(pg.Operation, request.Operation, StringComparison.Ordinal) &&
      string.Equals(pg.Scope, request.Scope, StringComparison.Ordinal);

    if (matchesPrior)
    {
      return new ConsentDecision(true, ConsentReason.MatchesPriorGrant, null);
    }

    // A prior grant for the same operation but a DIFFERENT scope is a material change.
    var isEscalation = priorGrant is { } escalationGrant &&
      string.Equals(escalationGrant.Operation, request.Operation, StringComparison.Ordinal);

    if (request.UserApproved != true)
    {
      if (isEscalation)
      {
        return new ConsentDecision(false, ConsentReason.SilentEscalation,
          "the operation differs materially from a prior grant; fresh consent MUST be sought and scope MUST NOT be silently escalated (R-28.2-e, R-28.2-f)");
      }
      return new ConsentDecision(false, ConsentReason.NoConsent,
        "no prior grant and no explicit approval; absence of refusal is never consent (R-28.2-a, R-28.2-d)");
    }

    // Freshly approved — but consent MUST be informed. (R-28.2-b)
    if (request.UserApproved == true && request.Scope.Length > 0)
    {
      return new ConsentDecision(true, ConsentReason.FreshlyApproved, null);
    }

    return new ConsentDecision(false, ConsentReason.NotInformed,
      "consent MUST be informed: the user MUST understand the data/action before authorizing (R-28.2-b)");
  }

  /// <summary>
  /// Builds the <see cref="ConsentGrant"/> to persist after a successful, informed approval, so a later
  /// identical operation matches without re-prompting (spec R-28.2-b, R-28.2-f). Only call after the
  /// user has actively and informedly approved.
  /// </summary>
  /// <param name="request">The freshly-approved operation (its <c>UserApproved</c> should be <c>true</c>).</param>
  /// <returns>The persisted grant.</returns>
  public static ConsentGrant RecordConsentGrant(ConsentRequest request) =>
    new(request.Operation, request.Scope, true);

  // ─── §28.3 — Tool safety: trust classification & rate limiting ───────────────────

  /// <summary>Classification of an input's trust, the §28 trust-boundary primitive (spec §28.1, §28.3, R-28.1-i, R-28.3-b).</summary>
  public enum InputTrust
  {
    /// <summary>From a server the host explicitly trusts.</summary>
    Trusted,

    /// <summary>From an untrusted source; may be adversarial.</summary>
    Untrusted,
  }

  /// <summary>
  /// Classifies a tool definition's trust: <see cref="InputTrust.Untrusted"/> unless obtained from a
  /// server the host trusts (spec §28.3, R-28.1-i, R-28.3-b; AC-44.6).
  /// </summary>
  /// <param name="serverIsTrusted">Whether the host explicitly trusts the originating server.</param>
  /// <returns>The trust classification.</returns>
  public static InputTrust ClassifyToolDefinitionTrust(bool serverIsTrusted) =>
    serverIsTrusted ? InputTrust.Trusted : InputTrust.Untrusted;

  /// <summary>
  /// Returns <c>false</c> — a tool annotation is NEVER a security guarantee (spec §28.3, R-28.3-c;
  /// AC-44.6). Unconditional: a receiver MUST NOT rely on an annotation as enforcement.
  /// </summary>
  /// <returns>Always <c>false</c>.</returns>
  public static bool ToolAnnotationIsSecurityGuarantee() => false;

  /// <summary>
  /// Returns whether a host MAY surface a tool's annotation hints to the user for THIS server (spec
  /// §28.3, R-28.3-b; AC-44.6). Displaying a hint from a trusted server is permitted; relying on it as a
  /// guarantee is not (<see cref="ToolAnnotationIsSecurityGuarantee"/>, R-28.3-c).
  /// </summary>
  /// <param name="serverIsTrusted">Whether the host explicitly trusts the server.</param>
  /// <returns><c>true</c> when the annotations may be displayed.</returns>
  public static bool MayDisplayToolAnnotations(bool serverIsTrusted) => serverIsTrusted;

  /// <summary>Outcome of <see cref="AssertHumanInTheLoop"/>.</summary>
  /// <param name="Ok"><c>true</c> when the human-in-the-loop invariant holds.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct HumanInTheLoopValidation(bool Ok, string? Reason);

  /// <summary>
  /// Asserts the human-in-the-loop invariant for a proposed tool invocation: the user could review and
  /// understand it and the decision did not rest solely with the model (spec §28.3, R-28.3-d, R-28.3-e;
  /// AC-44.8).
  /// </summary>
  /// <param name="userCouldReviewAndDeny">The user was able to review, understand, and deny before it ran (R-28.3-d).</param>
  /// <param name="modelDecidedAlone">The decision rested solely with the model, with no human gate (R-28.3-e).</param>
  /// <returns>The validation outcome.</returns>
  public static HumanInTheLoopValidation AssertHumanInTheLoop(bool userCouldReviewAndDeny, bool modelDecidedAlone)
  {
    if (modelDecidedAlone)
    {
      return new HumanInTheLoopValidation(false, "the decision to invoke a tool MUST NOT rest solely with the model (R-28.3-e)");
    }
    if (!userCouldReviewAndDeny)
    {
      return new HumanInTheLoopValidation(false, "a user MUST be able to review, understand, and deny a proposed tool invocation before it runs (R-28.3-d)");
    }
    return new HumanInTheLoopValidation(true, null);
  }

  /// <summary>The JSON-RPC error code a rate-limited or invalid-request rejection carries (spec §28.3 wire example).</summary>
  public const int RateLimitRejectionCode = -32600;

  /// <summary>A §28.3 rate-limit rejection error object, matching the story's wire example.</summary>
  /// <param name="Code">The error code (always <see cref="RateLimitRejectionCode"/>).</param>
  /// <param name="Message">The error message.</param>
  /// <param name="RetryAfterMs">An optional hint for when the client may retry.</param>
  public readonly record struct RateLimitRejectionError(int Code, string Message, int? RetryAfterMs);

  /// <summary>
  /// Builds the <c>-32600</c> rate-limit rejection error a server returns for a <c>tools/call</c> that
  /// exceeds the limit, matching the §28.3 wire example (spec R-28.3-h; AC-44.9).
  /// </summary>
  /// <param name="retryAfterMs">An optional hint for when the client may retry.</param>
  /// <param name="message">An optional override for the error message.</param>
  /// <returns>The rejection error.</returns>
  public static RateLimitRejectionError BuildRateLimitRejection(int? retryAfterMs = null, string? message = null) =>
    new(RateLimitRejectionCode, message ?? "Rate limit exceeded for tools/call", retryAfterMs);

  /// <summary>
  /// C0/C1 control characters a sanitized tool output MUST NOT carry, EXCLUDING ordinary whitespace
  /// <c>\t</c>, <c>\n</c>, <c>\r</c> (spec R-28.3-i). Covers ANSI/escape (<c>\x1b</c>) and other control
  /// sequences a malicious tool could smuggle.
  /// </summary>
  private static bool IsStrippedControlChar(char c)
  {
    int code = c;
    // C0 controls 0x00-0x08 (excludes \t 0x09); 0x0b VT and 0x0c FF (excludes \n 0x0a, \r 0x0d);
    // 0x0e-0x1f; and DEL 0x7f plus the C1 controls 0x80-0x9f.
    return code <= 0x08
      || code == 0x0b || code == 0x0c
      || (code >= 0x0e && code <= 0x1f)
      || (code >= 0x7f && code <= 0x9f);
  }

  /// <summary>
  /// Sanitizes a tool-output text string so a result cannot carry control sequences that would
  /// compromise the client, model, or downstream consumers (spec §28.3, R-28.3-i; AC-44.9). Strips C0/C1
  /// control characters (excluding the ordinary whitespace <c>\t</c>, <c>\n</c>, <c>\r</c>).
  /// </summary>
  /// <param name="text">The tool-output text to sanitize.</param>
  /// <returns>The sanitized text.</returns>
  public static string SanitizeToolOutputText(string text)
  {
    ArgumentNullException.ThrowIfNull(text);
    var builder = new StringBuilder(text.Length);
    foreach (var c in text)
    {
      if (!IsStrippedControlChar(c)) builder.Append(c);
    }
    return builder.ToString();
  }

  /// <summary>Returns <c>true</c> when <paramref name="text"/> contains a control sequence a sanitized output MUST NOT carry (spec R-28.3-i).</summary>
  /// <param name="text">The text to inspect.</param>
  /// <returns><c>true</c> when a stripped control character is present.</returns>
  public static bool ToolOutputHasControlSequences(string text)
  {
    ArgumentNullException.ThrowIfNull(text);
    foreach (var c in text)
    {
      if (IsStrippedControlChar(c)) return true;
    }
    return false;
  }

  // ─── §28.4 — Data privacy and isolation (R-28.4-a – R-28.4-f; AC-44.11) ───────────

  /// <summary>Outcome of <see cref="AssertServerIsolation"/> / <see cref="AssertConsentedDataExposure"/>.</summary>
  /// <param name="Ok"><c>true</c> when the invariant holds.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct IsolationValidation(bool Ok, string? Reason);

  /// <summary>
  /// Asserts the §28.4 server-isolation invariant: a server receives only host-elected context, never
  /// another server's requests/results/context/credentials (spec §28.4, R-28.4-a, R-28.4-d, R-28.4-e,
  /// R-28.4-f; AC-44.11).
  /// </summary>
  /// <param name="destinationServerId">The server the host is about to send context to.</param>
  /// <param name="hostElected"><c>true</c> when the host deliberately elected to share this context (R-28.4-a).</param>
  /// <param name="sourceServerId">The server the context/credential came from, or <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static IsolationValidation AssertServerIsolation(
    string destinationServerId, bool hostElected, string? sourceServerId = null)
  {
    if (sourceServerId is not null && !string.Equals(sourceServerId, destinationServerId, StringComparison.Ordinal))
    {
      return new IsolationValidation(false,
        $"the host MUST NOT relay server \"{sourceServerId}\"'s data/credentials to a different server \"{destinationServerId}\" (R-28.4-e, R-28.4-f)");
    }
    if (!hostElected)
    {
      return new IsolationValidation(false, "a server MUST receive only the context the host elects to share with it (R-28.4-a)");
    }
    return new IsolationValidation(true, null);
  }

  /// <summary>
  /// Asserts that user/resource data is exposed to a server (or onward) ONLY with the user's consent
  /// (spec §28.4, R-28.4-b, R-28.1-e, R-28.1-f; AC-44.3, AC-44.11). Wraps <see cref="EvaluateConsent"/>
  /// with the <c>resource-exposure</c> operation.
  /// </summary>
  /// <param name="scope">The scope summary of the data being exposed.</param>
  /// <param name="priorGrant">Any prior data-exposure consent grant.</param>
  /// <param name="userApproved">Whether the user freshly approved this exposure.</param>
  /// <returns>The validation outcome.</returns>
  public static IsolationValidation AssertConsentedDataExposure(
    string scope, ConsentGrant? priorGrant = null, bool? userApproved = null)
  {
    var decision = EvaluateConsent(new ConsentRequest("resource-exposure", scope, userApproved), priorGrant);
    return decision.Allowed
      ? new IsolationValidation(true, null)
      : new IsolationValidation(false, $"user data MUST NOT be exposed without consent: {decision.Detail}");
  }

  /// <summary>A coarse data-sensitivity class governing the strength of access controls a host SHOULD apply (spec §28.1, §28.4, R-28.1-g, R-28.4-c).</summary>
  public enum DataSensitivity
  {
    /// <summary>Public data.</summary>
    Public,

    /// <summary>Internal data.</summary>
    Internal,

    /// <summary>Confidential data.</summary>
    Confidential,

    /// <summary>Secret data — the most sensitive.</summary>
    Secret,
  }

  /// <summary>
  /// Returns <c>true</c> when the access controls a host applies are at least as strong as the data's
  /// sensitivity requires (spec §28.1, §28.4, R-28.1-g, R-28.4-c; AC-44.4). <c>confidential</c> data
  /// protected only at <c>internal</c> strength fails.
  /// </summary>
  /// <param name="dataSensitivity">The sensitivity class of the data.</param>
  /// <param name="appliedControl">The strongest access-control class the host enforces for it.</param>
  /// <returns><c>true</c> when controls are commensurate.</returns>
  public static bool AccessControlsAreCommensurate(DataSensitivity dataSensitivity, DataSensitivity appliedControl) =>
    (int)appliedControl >= (int)dataSensitivity;

  // ─── §28.5 — Authorization security (restates §23; R-28.5-a – R-28.5-q) ───────────

  /// <summary>Outcome of <see cref="ValidateServerAccessToken"/>.</summary>
  /// <param name="Ok"><c>true</c> when the token is audience-bound and validated.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="Code">The JSON-RPC rejection code (<c>-32600</c>) on failure, or <c>null</c>.</param>
  public readonly record struct ServerTokenValidation(bool Ok, string? Reason, int? Code);

  /// <summary>
  /// Validates, server-side, that a presented access token is audience-bound to THIS server and was
  /// validated before the request is processed; rejects otherwise so no data is returned to an
  /// unauthorized party (spec §28.5, R-28.5-b … R-28.5-e; AC-44.12). The audience claim may be a single
  /// resource (string) or an array; it matches when it includes the canonical resource.
  /// </summary>
  /// <param name="tokenAudience">The <c>aud</c> claim the presented token carries (string or array of strings).</param>
  /// <param name="ownCanonicalResource">This server's canonical resource identifier.</param>
  /// <param name="validatedBeforeUse"><c>true</c> when the token was cryptographically validated before processing (R-28.5-d).</param>
  /// <returns>The validation outcome.</returns>
  public static ServerTokenValidation ValidateServerAccessToken(
    IReadOnlyList<string> tokenAudience, string ownCanonicalResource, bool validatedBeforeUse)
  {
    ArgumentNullException.ThrowIfNull(tokenAudience);
    if (!validatedBeforeUse)
    {
      return new ServerTokenValidation(false,
        "a server MUST validate a token before processing the request it accompanies (R-28.5-d)", RateLimitRejectionCode);
    }
    if (!tokenAudience.Contains(ownCanonicalResource, StringComparer.Ordinal))
    {
      return new ServerTokenValidation(false,
        "token not valid for this resource: audience mismatch (R-28.5-b, R-28.5-c, R-28.5-e)", RateLimitRejectionCode);
    }
    return new ServerTokenValidation(true, null, null);
  }

  /// <summary>Outcome of <see cref="AssertNoTokenPassthrough"/>.</summary>
  /// <param name="Ok"><c>true</c> when no confused-deputy passthrough is present.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct TokenPassthroughValidation(bool Ok, string? Reason);

  /// <summary>
  /// Asserts the no-token-passthrough / confused-deputy rule: a server never forwards a client token
  /// upstream and uses a SEPARATE token issued by the upstream AS (spec §28.5, R-28.5-f, R-28.5-g;
  /// AC-44.13).
  /// </summary>
  /// <param name="clientPresentedToken">The bearer token the client presented to this server.</param>
  /// <param name="upstreamToken">The token this server intends to send upstream.</param>
  /// <param name="upstreamTokenIssuer">The issuer that minted the upstream token.</param>
  /// <param name="upstreamAuthorizationServerIssuer">The upstream API's authorization server issuer.</param>
  /// <returns>The validation outcome.</returns>
  public static TokenPassthroughValidation AssertNoTokenPassthrough(
    string clientPresentedToken,
    string upstreamToken,
    string upstreamTokenIssuer,
    string upstreamAuthorizationServerIssuer)
  {
    if (string.Equals(upstreamToken, clientPresentedToken, StringComparison.Ordinal))
    {
      return new TokenPassthroughValidation(false,
        "a server MUST NOT forward a client-supplied token onward to an upstream API (confused deputy) (R-28.5-f)");
    }
    if (!string.Equals(upstreamTokenIssuer, upstreamAuthorizationServerIssuer, StringComparison.Ordinal))
    {
      return new TokenPassthroughValidation(false,
        "when calling an upstream API a server MUST use a separate token issued by the upstream authorization server (R-28.5-g)");
    }
    return new TokenPassthroughValidation(true, null);
  }

  /// <summary>Outcome of <see cref="ValidateAuthorizationIssuer"/>.</summary>
  /// <param name="Ok"><c>true</c> when the returned issuer matches the recorded one.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct IssuerValidation(bool Ok, string? Reason);

  /// <summary>
  /// Validates the exact-issuer mix-up defense for an authorization response: the client MUST have
  /// recorded the expected issuer before redirect and MUST compare any returned issuer by exact string
  /// comparison, rejecting mismatches (spec §28.5, R-28.5-h, R-28.5-i; AC-44.14).
  /// </summary>
  /// <param name="recordedIssuer">The issuer recorded BEFORE redirect (R-28.5-h).</param>
  /// <param name="iss">The <c>iss</c> returned in the authorization response, or <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static IssuerValidation ValidateAuthorizationIssuer(string recordedIssuer, string? iss = null)
  {
    if (iss is not null && !string.Equals(iss, recordedIssuer, StringComparison.Ordinal))
    {
      return new IssuerValidation(false,
        $"returned issuer \"{iss}\" does not match the recorded issuer \"{recordedIssuer}\" (R-28.5-i)");
    }
    return new IssuerValidation(true, null);
  }

  /// <summary>Outcome of <see cref="AssertTokenTransportSecurity"/>.</summary>
  /// <param name="Ok"><c>true</c> when the token-confidentiality transport rules hold.</param>
  /// <param name="Reason">The first violation when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct TokenTransportValidation(bool Ok, string? Reason);

  /// <summary>
  /// Asserts the §28.5 token-confidentiality transport rules: tokens are never logged, never forwarded
  /// to a party other than the one they were issued for, and authorization-server endpoints and redirect
  /// URIs use HTTPS (a <c>localhost</c> redirect is permitted) (spec §28.5, R-28.5-n … R-28.5-q, R-28.9-d;
  /// AC-44.17). Returns the first violation.
  /// </summary>
  /// <param name="endpointUrls">Authorization-server endpoint URLs (R-28.5-q).</param>
  /// <param name="tokenLogged">Whether any token was written to a log/trace (MUST be <c>false</c>) (R-28.5-o).</param>
  /// <param name="tokenForwarded">Whether a token was forwarded to a party other than its intended one (MUST be <c>false</c>) (R-28.5-p).</param>
  /// <param name="redirectUris">The client redirect URIs (loopback http permitted), or <c>null</c> (R-28.5-q).</param>
  /// <returns>The validation outcome.</returns>
  public static TokenTransportValidation AssertTokenTransportSecurity(
    IReadOnlyList<string> endpointUrls,
    bool tokenLogged,
    bool tokenForwarded,
    IReadOnlyList<string>? redirectUris = null)
  {
    ArgumentNullException.ThrowIfNull(endpointUrls);
    if (tokenLogged)
    {
      return new TokenTransportValidation(false, "tokens MUST NOT be logged (R-28.5-o, R-28.9-d)");
    }
    if (tokenForwarded)
    {
      return new TokenTransportValidation(false, "tokens MUST NOT be forwarded to any party other than the one they were issued for (R-28.5-p)");
    }
    foreach (var url in endpointUrls)
    {
      if (!IsHttpsUrl(url))
      {
        return new TokenTransportValidation(false, $"authorization-server endpoint \"{url}\" MUST use HTTPS (R-28.5-q)");
      }
    }
    foreach (var uri in redirectUris ?? [])
    {
      if (!IsHttpsUrl(uri) && !IsLoopbackHttpUrl(uri))
      {
        return new TokenTransportValidation(false, $"redirect URI \"{uri}\" MUST use HTTPS (a localhost redirect is permitted) (R-28.5-q)");
      }
    }
    return new TokenTransportValidation(true, null);
  }

  /// <summary>Returns <c>true</c> when <paramref name="url"/> is a valid <c>https:</c> URL (spec R-28.5-q).</summary>
  private static bool IsHttpsUrl(string url) =>
    Uri.TryCreate(url, UriKind.Absolute, out var u) && string.Equals(u.Scheme, "https", StringComparison.Ordinal);

  /// <summary>Returns <c>true</c> when <paramref name="url"/> is an <c>http:</c> URL whose host is a loopback address (spec R-28.5-q).</summary>
  private static bool IsLoopbackHttpUrl(string url)
  {
    if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
    if (!string.Equals(u.Scheme, "http", StringComparison.Ordinal)) return false;
    var host = u.Host.ToLowerInvariant();
    return host is "localhost" or "127.0.0.1" or "::1" or "[::1]";
  }

  // ─── §28.6 — Multi-round-trip & continuation safety (R-28.6-a – R-28.6-c) ─────────

  /// <summary>The reason a continuation token is rejected (spec §28.6).</summary>
  public enum ContinuationTokenFailure
  {
    /// <summary>No failure (success).</summary>
    None,

    /// <summary>The presented integrity tag does not match.</summary>
    IntegrityFailure,

    /// <summary>The token has expired.</summary>
    Expired,

    /// <summary>The token was already consumed (single-use replay).</summary>
    Replayed,

    /// <summary>The token is not recognized.</summary>
    Unknown,
  }

  /// <summary>A server-side record of continuation state — the §28.6 handling profile for the requestState token.</summary>
  /// <typeparam name="TState">The server-held state type.</typeparam>
  /// <param name="Value">The opaque token value handed to the client.</param>
  /// <param name="IntegrityTag">The integrity tag the server uses to detect tampering (R-28.6-a).</param>
  /// <param name="State">The server-held continuation state the token stands for.</param>
  /// <param name="ExpiresAtMs">Epoch ms after which the token is expired; <c>null</c> ⇒ no time bound (R-28.6-c).</param>
  /// <param name="Consumed"><c>true</c> once the token has been consumed, for single-use replay defense (R-28.6-c).</param>
  public sealed record ContinuationTokenRecord<TState>(
    string Value, string IntegrityTag, TState State, long? ExpiresAtMs, bool Consumed);

  /// <summary>Outcome of <see cref="ContinuationTokenStore{TState}.Validate"/>.</summary>
  /// <typeparam name="TState">The server-held state type.</typeparam>
  /// <param name="Ok"><c>true</c> when the token is valid and the protected state is returned.</param>
  /// <param name="State">The protected state on success, or <c>default</c>.</param>
  /// <param name="Reason">The rejection reason when <paramref name="Ok"/> is <c>false</c>.</param>
  /// <param name="Detail">A human-readable detail on a rejection, or <c>null</c>.</param>
  public readonly record struct ContinuationTokenValidation<TState>(
    bool Ok, TState? State, ContinuationTokenFailure Reason, string? Detail);

  // ─── §28.7 — Elicitation & sampling consent (R-28.7-a – R-28.7-g; AC-44.19/20) ────

  /// <summary>The terminal user decision on a server-initiated elicitation (spec §28.7, R-28.7-b, R-28.7-c).</summary>
  public enum ElicitationUserDecision
  {
    /// <summary>The user approved the request.</summary>
    Approve,

    /// <summary>The user edited and approved the request.</summary>
    Edit,

    /// <summary>The user declined the request.</summary>
    Decline,

    /// <summary>The user cancelled the request.</summary>
    Cancel,
  }

  /// <summary>Outcome of <see cref="AssertElicitationUnderUserControl"/> / <see cref="AssertSamplingUnderUserControl"/>.</summary>
  /// <param name="Ok"><c>true</c> when the flow remained under user control.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct UserControlValidation(bool Ok, string? Reason);

  /// <summary>
  /// Asserts a server-initiated elicitation remained under user control before anything was returned to
  /// the server (spec §28.7, R-28.7-a … R-28.7-e; AC-44.19): the user could review and reach an explicit
  /// decision, the requesting server's identity was shown, and the request did not phish for secrets via
  /// form mode. A <c>decline</c>/<c>cancel</c> decision is always permitted (the user may stop at any
  /// point), returning <c>Ok</c> without requiring the schema to be safe.
  /// </summary>
  /// <param name="decision">The user's terminal decision (R-28.7-b, R-28.7-c).</param>
  /// <param name="userCouldReview">The user was able to review the request before deciding (R-28.7-b).</param>
  /// <param name="serverIdentityShown">The requesting server's identity was made clear (R-28.7-e).</param>
  /// <param name="requestedSchema">The form-mode requested schema, checked for secret-phishing (R-28.7-d), or <c>null</c>.</param>
  /// <returns>The validation outcome.</returns>
  public static UserControlValidation AssertElicitationUnderUserControl(
    ElicitationUserDecision decision,
    bool userCouldReview,
    bool serverIdentityShown,
    JsonObject? requestedSchema = null)
  {
    if (!userCouldReview)
    {
      return new UserControlValidation(false, "the user MUST be able to review an elicitation request before responding (R-28.7-b)");
    }
    // Declining/cancelling is always available; nothing is returned to the server.
    if (decision is ElicitationUserDecision.Decline or ElicitationUserDecision.Cancel)
    {
      return new UserControlValidation(true, null);
    }
    if (!serverIdentityShown)
    {
      return new UserControlValidation(false, "the requesting server’s identity SHOULD be made clear in the elicitation interface (R-28.7-e)");
    }
    if (requestedSchema is not null)
    {
      var sensitive = SensitiveFormFields(requestedSchema);
      if (sensitive.Count > 0)
      {
        return new UserControlValidation(false,
          $"a server MUST NOT use elicitation to phish for secrets; sensitive fields [{string.Join(", ", sensitive)}] MUST use URL mode (R-28.7-d)");
      }
    }
    return new UserControlValidation(true, null);
  }

  /// <summary>Field-name fragments whose presence in a form schema indicates a secret a server MUST NOT phish for (spec R-28.7-d).</summary>
  private static readonly string[] SensitiveFieldFragments =
    ["password", "secret", "token", "apikey", "api_key", "credential", "passcode", "pin", "ssn", "creditcard", "card_number"];

  /// <summary>
  /// Returns the property names of a form-mode requested schema that look like secrets a server MUST NOT
  /// collect via a form (spec R-28.7-d). Reproduces the observable behavior of S31's
  /// <c>assertFormModeMayCollect</c>: a field whose key (or its <c>title</c>) contains a sensitive
  /// fragment must instead use URL mode.
  /// </summary>
  private static IReadOnlyList<string> SensitiveFormFields(JsonObject schema)
  {
    var sensitive = new List<string>();
    if (schema["properties"] is not JsonObject properties) return sensitive;
    foreach (var (name, propNode) in properties)
    {
      var haystack = name.ToLowerInvariant();
      if (propNode is JsonObject prop && prop["title"] is JsonValue tv && tv.TryGetValue<string>(out var title))
      {
        haystack += " " + title.ToLowerInvariant();
      }
      var normalized = haystack.Replace(" ", "").Replace("-", "").Replace("_", "");
      if (SensitiveFieldFragments.Any(f => normalized.Contains(f.Replace("_", ""), StringComparison.Ordinal)))
      {
        sensitive.Add(name);
      }
    }
    return sensitive;
  }

  /// <summary>
  /// The host's §21.2.10 sampling consent-obligation claims (spec §28.7). The MUST-level fields gate
  /// whether a server-driven sampling flow remained under user control.
  /// </summary>
  /// <param name="HumanInTheLoop">A human reviewed the sampling flow.</param>
  /// <param name="UserMayDeny">The user could deny the sampling request.</param>
  /// <param name="ReviewPromptBeforeSampling">The prompt was reviewed before sampling.</param>
  /// <param name="ReviewResultBeforeServer">The result was reviewed before being returned to the server.</param>
  /// <param name="HandleSensitiveData">Sensitive data was handled per policy.</param>
  public readonly record struct SamplingConsentObligations(
    bool HumanInTheLoop,
    bool UserMayDeny,
    bool ReviewPromptBeforeSampling,
    bool ReviewResultBeforeServer,
    bool HandleSensitiveData);

  /// <summary>Returns the MUST-level sampling obligations that are unmet (spec R-28.7-a).</summary>
  private static IReadOnlyList<string> UnmetRequiredConsentObligations(SamplingConsentObligations o)
  {
    var unmet = new List<string>();
    if (!o.HumanInTheLoop) unmet.Add("humanInTheLoop");
    if (!o.UserMayDeny) unmet.Add("userMayDeny");
    if (!o.ReviewPromptBeforeSampling) unmet.Add("reviewPromptBeforeSampling");
    if (!o.ReviewResultBeforeServer) unmet.Add("reviewResultBeforeServer");
    if (!o.HandleSensitiveData) unmet.Add("handleSensitiveData");
    return unmet;
  }

  /// <summary>
  /// Asserts a server-driven sampling flow remained under user control: the MUST-level §28.7 obligations
  /// are met (human review of prompt and completion before they are acted upon or transmitted) and the
  /// host disclosed no more conversation context than the user authorized (spec §28.7, R-28.7-a,
  /// R-28.7-f, R-28.7-g; AC-44.20).
  /// </summary>
  /// <param name="obligations">The host's §21.2.10 consent-obligation claims (R-28.7-a).</param>
  /// <param name="promptReviewed">The prompt sent to the model was human-reviewed/approved (R-28.7-f).</param>
  /// <param name="completionReviewed">The completion was human-reviewed before being acted upon (R-28.7-f).</param>
  /// <param name="disclosedContextWithinAuthorization">The disclosed conversation context was within what the user authorized (R-28.7-g).</param>
  /// <returns>The validation outcome.</returns>
  public static UserControlValidation AssertSamplingUnderUserControl(
    SamplingConsentObligations obligations,
    bool promptReviewed,
    bool completionReviewed,
    bool disclosedContextWithinAuthorization)
  {
    var unmet = UnmetRequiredConsentObligations(obligations);
    if (unmet.Count > 0)
    {
      return new UserControlValidation(false,
        $"sampling MUST remain under user control; unmet obligations: {string.Join(", ", unmet)} (R-28.7-a)");
    }
    if (!promptReviewed || !completionReviewed)
    {
      return new UserControlValidation(false,
        "sampling prompts and completions MUST be subject to human review before being acted upon or transmitted (R-28.7-f)");
    }
    if (!disclosedContextWithinAuthorization)
    {
      return new UserControlValidation(false,
        "the host MUST NOT disclose more conversation context to a sampling request than the user authorized (R-28.7-g)");
    }
    return new UserControlValidation(true, null);
  }

  // ─── §28.8 — UI sandboxing (R-28.8-a – R-28.8-h; AC-44.21/22) ─────────────────────

  /// <summary>The categories a conforming UI sandbox MUST deny so it cannot exfiltrate host/user state (spec R-28.8-a, R-28.8-f).</summary>
  private static readonly string[] RequiredSandboxDenials = ["dom", "cookies", "storage", "navigation"];

  /// <summary>Returns <c>true</c> when the sandbox denies every required category (spec R-28.8-a, R-28.8-f).</summary>
  private static bool SandboxIsolationIsConforming(IEnumerable<string> deniedAccess)
  {
    var denied = new HashSet<string>(deniedAccess, StringComparer.OrdinalIgnoreCase);
    return RequiredSandboxDenials.All(denied.Contains);
  }

  /// <summary>Returns <c>true</c> when nothing exposed to the UI looks like a credential/token/unrelated state (spec R-28.8-e).</summary>
  private static bool UiExposureIsClean(JsonObject exposedToUi) =>
    !exposedToUi.Any(kv => IsSensitiveLogKey(kv.Key));

  /// <summary>
  /// Asserts a server-provided UI is rendered conformingly: it runs in an isolated sandbox that denies
  /// DOM/cookies/storage/navigation, under a restrictive CSP, and exposes no credentials/tokens/unrelated
  /// context (spec §28.8, R-28.8-a, R-28.8-e, R-28.8-f, R-28.8-g; AC-44.21, AC-44.22).
  /// </summary>
  /// <param name="sandboxDeniedAccess">The categories the sandbox denies (R-28.8-a).</param>
  /// <param name="restrictiveCspApplied">Whether a restrictive content-security policy is applied (R-28.8-a).</param>
  /// <param name="exposedToUi">The data the host hands to the UI, exposure-checked (R-28.8-e).</param>
  /// <returns>The validation outcome.</returns>
  public static UserControlValidation AssertUiSandboxConforming(
    IEnumerable<string> sandboxDeniedAccess, bool restrictiveCspApplied, JsonObject exposedToUi)
  {
    ArgumentNullException.ThrowIfNull(sandboxDeniedAccess);
    ArgumentNullException.ThrowIfNull(exposedToUi);
    if (!restrictiveCspApplied)
    {
      return new UserControlValidation(false, "server-provided UI MUST be rendered under a restrictive content-security policy (R-28.8-a)");
    }
    if (!SandboxIsolationIsConforming(sandboxDeniedAccess))
    {
      return new UserControlValidation(false, "the UI sandbox MUST deny DOM/cookies/storage/navigation so it cannot exfiltrate host/user state (R-28.8-a, R-28.8-f)");
    }
    if (!UiExposureIsClean(exposedToUi))
    {
      return new UserControlValidation(false, "the host MUST NOT expose credentials/tokens/unrelated context to the sandboxed UI (R-28.8-e)");
    }
    return new UserControlValidation(true, null);
  }

  /// <summary>The input to a UI-initiated <c>tools/call</c> mediation (spec §28.8 / S42).</summary>
  /// <param name="UiVisibility">The tool's UI visibility list; a UI-initiated call requires <c>app</c> visibility.</param>
  /// <param name="UserConsented">Whether the user consented to the call.</param>
  /// <param name="PolicyAllows">Whether host policy allows the call.</param>
  public readonly record struct ToolsCallMediationInput(
    IReadOnlyList<string> UiVisibility, bool UserConsented, bool PolicyAllows);

  /// <summary>The mediation decision for a UI-initiated <c>tools/call</c>.</summary>
  /// <param name="Route"><c>true</c> when the call may be routed to a server.</param>
  public readonly record struct ToolsCallMediationDecision(bool Route);

  /// <summary>
  /// Mediates a UI-requested <c>tools/call</c>, routing it through the host's normal consent /
  /// human-in-the-loop path; the UI can never cause a tool to run without host mediation and user
  /// consent (spec §28.8, R-28.8-b, R-28.8-c, R-28.8-d; AC-44.21). Routes only when the tool has
  /// <c>app</c> visibility AND the user consented AND host policy allows.
  /// </summary>
  /// <param name="input">The UI tool-call mediation input.</param>
  /// <returns>The mediation decision.</returns>
  public static ToolsCallMediationDecision MediateUiInitiatedToolCall(ToolsCallMediationInput input)
  {
    var appVisible = input.UiVisibility.Contains("app", StringComparer.Ordinal);
    return new ToolsCallMediationDecision(appVisible && input.UserConsented && input.PolicyAllows);
  }

  // ─── §28.9 — Metadata & observability (R-28.9-a – R-28.9-e; AC-44.23) ─────────────

  /// <summary>
  /// Returns <c>false</c> — metadata MUST NOT be a source of authority (spec §28.9, R-28.9-a; AC-44.23).
  /// Unconditional, so a caller cannot accidentally derive authority from a metadata field.
  /// </summary>
  /// <returns>Always <c>false</c>.</returns>
  public static bool MetadataConveysAuthority() => false;

  /// <summary>Keys whose values are credentials/tokens and MUST NOT be logged or recorded (spec R-28.9-c, R-28.9-d).</summary>
  private static readonly string[] SensitiveLogKeys =
  [
    "authorization", "token", "access_token", "accesstoken", "refresh_token", "refreshtoken",
    "id_token", "secret", "client_secret", "password", "api_key", "apikey", "cookie", "set-cookie",
  ];

  /// <summary>Returns <c>true</c> when a metadata/log key names a credential/token that MUST NOT be logged (spec R-28.9-d).</summary>
  private static bool IsSensitiveLogKey(string key)
  {
    var k = key.ToLowerInvariant();
    return SensitiveLogKeys.Any(s => k == s || k.Contains(s, StringComparison.Ordinal));
  }

  /// <summary>The placeholder substituted for a redacted credential/token value (spec R-28.9-d, R-28.9-e).</summary>
  public const string RedactedPlaceholder = "[REDACTED]";

  /// <summary>
  /// Returns a copy of a JSON value intended for a log/trace/telemetry sink with credential/token values
  /// redacted (spec §28.9, R-28.9-c, R-28.9-d, R-28.9-e; AC-44.23, AC-44.17). Walks the value
  /// recursively; any property whose key names a credential/token has its value replaced with
  /// <see cref="RedactedPlaceholder"/>. The input is never mutated.
  /// </summary>
  /// <param name="value">The value about to be logged.</param>
  /// <returns>A NEW value with sensitive entries redacted.</returns>
  public static JsonNode? RedactForLogging(JsonNode? value)
  {
    switch (value)
    {
      case JsonArray array:
        {
          var output = new JsonArray();
          foreach (var item in array) output.Add(RedactForLogging(item?.DeepClone()));
          return output;
        }
      case JsonObject obj:
        {
          var output = new JsonObject();
          foreach (var (key, v) in obj)
          {
            output[key] = IsSensitiveLogKey(key) ? RedactedPlaceholder : RedactForLogging(v?.DeepClone());
          }
          return output;
        }
      default:
        return value?.DeepClone();
    }
  }

  /// <summary>
  /// Validates the structure of consumed metadata, returning only the entries the receiver understands
  /// and ignoring the rest (spec §28.9, R-28.9-b; AC-44.23). Keeps only keys in
  /// <paramref name="known"/> (and only when present and non-null). Never throws — a non-object yields an
  /// empty object.
  /// </summary>
  /// <param name="metadata">The raw metadata value from a peer.</param>
  /// <param name="known">The metadata keys this receiver understands.</param>
  /// <returns>A NEW object containing only known keys.</returns>
  public static JsonObject SanitizeConsumedMetadata(JsonNode? metadata, IEnumerable<string> known)
  {
    ArgumentNullException.ThrowIfNull(known);
    var output = new JsonObject();
    if (metadata is not JsonObject obj) return output;
    var knownSet = new HashSet<string>(known, StringComparer.Ordinal);
    foreach (var (key, value) in obj)
    {
      if (knownSet.Contains(key) && value is not null)
      {
        output[key] = value.DeepClone();
      }
    }
    return output;
  }

  // ─── §28.10 — Input validation & resource bounds (R-28.10-a – R-28.10-p) ──────────

  /// <summary>The JSON-RPC error code a validation/cursor/argument failure is reported with (spec §28.10).</summary>
  public const int ValidationErrorCode = -32602;

  /// <summary>The JSON-RPC error code an invalid pagination cursor is reported with (spec §18 / §28.10-j).</summary>
  public const int InvalidCursorCode = -32602;

  /// <summary>A tool's declared schemas for <see cref="ValidatePeerToolCall"/>.</summary>
  /// <param name="InputSchema">The tool's <c>inputSchema</c>.</param>
  /// <param name="OutputSchema">The tool's optional <c>outputSchema</c>.</param>
  public readonly record struct ToolSchemas(JsonObject InputSchema, JsonObject? OutputSchema = null);

  /// <summary>Outcome of <see cref="ValidatePeerToolCall"/>.</summary>
  /// <param name="Ok"><c>true</c> when the arguments (and any structured result) validate.</param>
  /// <param name="Code">The <c>-32602</c> error code on failure, or <c>null</c>.</param>
  /// <param name="Message">The failure message, or <c>null</c>.</param>
  /// <param name="Errors">The per-field validation errors, or empty.</param>
  public readonly record struct PeerToolCallValidation(bool Ok, int? Code, string? Message, IReadOnlyList<string> Errors);

  /// <summary>
  /// Validates <c>tools/call</c> arguments against a tool's declared input schema and, optionally,
  /// structured results against an output schema, reporting a failure as a <c>-32602</c> error rather
  /// than acting on the input (spec §28.10, R-28.10-a … R-28.10-e; AC-44.24). The schema check enforces
  /// the common JSON Schema constraints (<c>required</c>, top-level property <c>type</c>, <c>enum</c>),
  /// mirroring the SDK's pragmatic validator.
  /// </summary>
  /// <param name="tool">The tool's declared schemas.</param>
  /// <param name="args">The <c>arguments</c> object to validate (R-28.10-c).</param>
  /// <param name="structuredResult">An optional structured result to validate against the output schema (R-28.10-d).</param>
  /// <returns>The validation outcome.</returns>
  public static PeerToolCallValidation ValidatePeerToolCall(
    ToolSchemas tool, JsonNode? args, JsonNode? structuredResult = null)
  {
    var argErrors = ValidateAgainstSchema(tool.InputSchema, args);
    if (argErrors.Count > 0)
    {
      return new PeerToolCallValidation(false, ValidationErrorCode, "Tool arguments failed input-schema validation", argErrors);
    }
    if (structuredResult is not null && tool.OutputSchema is not null)
    {
      var resultErrors = ValidateAgainstSchema(tool.OutputSchema, structuredResult);
      if (resultErrors.Count > 0)
      {
        return new PeerToolCallValidation(false, ValidationErrorCode, "Structured result failed output-schema validation", resultErrors);
      }
    }
    return new PeerToolCallValidation(true, null, null, []);
  }

  /// <summary>
  /// Validates a JSON value against the common JSON Schema 2020-12 constraints (<c>required</c>,
  /// top-level property <c>type</c>, <c>enum</c>), returning the list of human-readable errors. A
  /// self-contained reproduction of the SDK's pragmatic validator; not a full schema engine.
  /// </summary>
  private static IReadOnlyList<string> ValidateAgainstSchema(JsonObject schema, JsonNode? valueNode)
  {
    var errors = new List<string>();
    if (valueNode is not JsonObject value)
    {
      // A non-object value is only an error when the schema declares it must be an object.
      if (schema["type"] is JsonValue tv && tv.TryGetValue<string>(out var t) && t == "object")
      {
        errors.Add("value must be of type object");
      }
      return errors;
    }

    if (schema["required"] is JsonArray required)
    {
      foreach (var entry in required)
      {
        if (entry is JsonValue rv && rv.TryGetValue<string>(out var key) && !value.ContainsKey(key))
        {
          errors.Add($"missing required argument \"{key}\"");
        }
      }
    }

    if (schema["properties"] is JsonObject properties)
    {
      foreach (var (name, propNode) in properties)
      {
        if (propNode is not JsonObject prop) continue;
        if (value[name] is not JsonNode field) continue; // absent → nothing to check here

        if (prop["type"] is JsonValue typeValue && typeValue.TryGetValue<string>(out var type) && !MatchesType(type, field))
        {
          errors.Add($"argument \"{name}\" must be of type {type}");
        }
        if (prop["enum"] is JsonArray allowed && !allowed.Any(option => JsonNode.DeepEquals(option, field)))
        {
          errors.Add($"argument \"{name}\" is not one of the allowed values");
        }
      }
    }
    return errors;
  }

  /// <summary>Returns <c>true</c> when a JSON value matches a JSON Schema primitive type token.</summary>
  private static bool MatchesType(string type, JsonNode value)
  {
    var kind = value.GetValueKind();
    return type switch
    {
      "string" => kind == JsonValueKind.String,
      "number" => kind == JsonValueKind.Number,
      "integer" => kind == JsonValueKind.Number && value is JsonValue n && n.TryGetValue<long>(out _),
      "boolean" => kind is JsonValueKind.True or JsonValueKind.False,
      "object" => kind == JsonValueKind.Object,
      "array" => kind == JsonValueKind.Array,
      "null" => kind == JsonValueKind.Null,
      _ => true,
    };
  }

  /// <summary>Outcome of <see cref="ValidateResourceUriAccess"/>.</summary>
  /// <param name="Ok"><c>true</c> when the URI is valid, authorized, and (when guarded) not an SSRF target.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct ResourceUriValidation(bool Ok, string? Reason);

  /// <summary>
  /// Validates a resource URI before dereferencing or matching it: it parses as an absolute URI, its
  /// location is one the user has authorized, and (when it could trigger a network request) it is not an
  /// SSRF target (spec §28.10, R-28.10-f, R-28.10-g, R-28.10-h; AC-44.25).
  /// </summary>
  /// <param name="uri">The resource URI to validate (R-28.10-f).</param>
  /// <param name="isAuthorizedLocation">Predicate: is this URL a location the user authorized? (R-28.10-g)</param>
  /// <param name="guardSsrf">When <c>true</c>, reject private/loopback/link-local hosts (R-28.10-h).</param>
  /// <returns>The validation outcome.</returns>
  public static ResourceUriValidation ValidateResourceUriAccess(
    string uri, Func<Uri, bool> isAuthorizedLocation, bool guardSsrf = false)
  {
    ArgumentNullException.ThrowIfNull(isAuthorizedLocation);
    if (!Uri.TryCreate(uri, UriKind.Absolute, out var url))
    {
      return new ResourceUriValidation(false, "resource URI MUST be a valid absolute URI before it is dereferenced or matched (R-28.10-f)");
    }
    if (!isAuthorizedLocation(url))
    {
      return new ResourceUriValidation(false, "a receiver MUST NOT follow a URI to a location the user has not authorized (R-28.10-g)");
    }
    if (guardSsrf && IsLikelySsrfTarget(url))
    {
      return new ResourceUriValidation(false, "the URI resolves to a private/loopback/link-local host; guard against SSRF (R-28.10-h)");
    }
    return new ResourceUriValidation(true, null);
  }

  /// <summary>Returns <c>true</c> when a URL's host is a private/loopback/link-local literal (an SSRF risk) (spec R-28.10-h).</summary>
  private static bool IsLikelySsrfTarget(Uri url)
  {
    var host = url.Host.ToLowerInvariant();
    if (host == "localhost" || host.EndsWith(".localhost", StringComparison.Ordinal)) return true;
    if (host is "::1" or "[::1]") return true;

    var ipv4 = host.Split('.');
    if (ipv4.Length == 4 && ipv4.All(p => byte.TryParse(p, out _)))
    {
      var a = byte.Parse(ipv4[0]);
      var b = byte.Parse(ipv4[1]);
      if (a == 127) return true; // loopback
      if (a == 10) return true; // private
      if (a == 192 && b == 168) return true; // private
      if (a == 172 && b >= 16 && b <= 31) return true; // private
      if (a == 169 && b == 254) return true; // link-local
      if (a == 0) return true; // "this host"
    }
    if (host.StartsWith("[fc", StringComparison.Ordinal) || host.StartsWith("[fd", StringComparison.Ordinal) ||
        host.StartsWith("[fe8", StringComparison.Ordinal) || host.StartsWith("[fe9", StringComparison.Ordinal) ||
        host.StartsWith("[fea", StringComparison.Ordinal) || host.StartsWith("[feb", StringComparison.Ordinal))
    {
      return true;
    }
    return false;
  }

  /// <summary>Outcome of <see cref="ValidateRequestOrigin"/>.</summary>
  /// <param name="Accepted"><c>true</c> when the origin is accepted (absent or in the allow-list).</param>
  /// <param name="Origin">The rejected origin when <paramref name="Accepted"/> is <c>false</c>, or <c>null</c>.</param>
  public readonly record struct OriginValidation(bool Accepted, string? Origin);

  /// <summary>
  /// Validates an <c>Origin</c> header against the server's accepted-origin set on every incoming HTTP
  /// connection, rejecting untrusted origins to defend against DNS-rebinding — the §28.10-i restatement
  /// of the §9.11 rule (spec §28.10, R-28.10-i; AC-44.26). An absent <c>Origin</c> or one in the set
  /// passes.
  /// </summary>
  /// <param name="origin">The request's <c>Origin</c> header value, or <c>null</c>.</param>
  /// <param name="acceptedOrigins">The origins the server is configured to accept.</param>
  /// <returns>The validation outcome.</returns>
  public static OriginValidation ValidateRequestOrigin(string? origin, IEnumerable<string> acceptedOrigins)
  {
    ArgumentNullException.ThrowIfNull(acceptedOrigins);
    if (origin is null) return new OriginValidation(true, null);
    var allow = acceptedOrigins as ISet<string> ?? new HashSet<string>(acceptedOrigins, StringComparer.Ordinal);
    return allow.Contains(origin) ? new OriginValidation(true, null) : new OriginValidation(false, origin);
  }

  /// <summary>The error a malformed/unknown/expired cursor is rejected with (spec §28.10-j).</summary>
  /// <param name="Code">The error code (<c>-32602</c>).</param>
  /// <param name="Message">The error message.</param>
  public readonly record struct InvalidCursorError(int Code, string Message);

  /// <summary>Outcome of <see cref="ValidatePaginationCursor"/>.</summary>
  /// <param name="Ok"><c>true</c> when the cursor is valid (or absent — the first page).</param>
  /// <param name="Cursor">The validated cursor, or <c>null</c> for the first page.</param>
  /// <param name="Error">The rejection error when <paramref name="Ok"/> is <c>false</c>, or <c>null</c>.</param>
  public readonly record struct CursorValidation(bool Ok, string? Cursor, InvalidCursorError? Error);

  /// <summary>
  /// Validates a pagination cursor as opaque, untrusted input: it is rejected with a <c>-32602</c> error
  /// when malformed, unknown, or expired, rather than having its attacker-controlled contents interpreted
  /// (spec §28.10, R-28.10-j; AC-44.27). The <paramref name="isKnown"/> predicate is the server's own
  /// recognition check. An absent cursor is valid — it requests the first page.
  /// </summary>
  /// <param name="cursor">The cursor the client supplied, or <c>null</c> for the first page.</param>
  /// <param name="isKnown">Predicate: did this server issue this cursor and is it still valid?</param>
  /// <returns>The validation outcome.</returns>
  public static CursorValidation ValidatePaginationCursor(string? cursor, Func<string, bool> isKnown)
  {
    ArgumentNullException.ThrowIfNull(isKnown);
    if (cursor is null) return new CursorValidation(true, null, null);
    return isKnown(cursor)
      ? new CursorValidation(true, cursor, null)
      : new CursorValidation(false, null, new InvalidCursorError(InvalidCursorCode, "Invalid cursor: malformed, unknown, or expired"));
  }

  /// <summary>Resource bounds a receiver imposes while validating peer inputs (spec §28.10, R-28.10-k, R-28.10-l).</summary>
  /// <param name="MaxSchemaDepth">Maximum schema nesting depth; deeper schemas are rejected (R-28.10-k).</param>
  /// <param name="MaxPayloadBytes">Maximum serialized payload size in bytes; larger inputs are rejected (R-28.10-l).</param>
  public readonly record struct InputBounds(int MaxSchemaDepth, int MaxPayloadBytes);

  /// <summary>The default schema nesting-depth limit (mirrors the SDK's <c>DEFAULT_SCHEMA_LIMITS.maxDepth</c>).</summary>
  public const int DefaultMaxSchemaDepth = 64;

  /// <summary>Default input bounds: a conservative schema-depth and 4 MiB payload-size cap (spec §28.10, R-28.10-k, R-28.10-l).</summary>
  public static InputBounds DefaultInputBounds { get; } = new(DefaultMaxSchemaDepth, 4 * 1024 * 1024);

  /// <summary>Outcome of <see cref="EnforceInputBounds"/>.</summary>
  /// <param name="Ok"><c>true</c> when the input is within the bounds.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct InputBoundsValidation(bool Ok, string? Reason);

  /// <summary>
  /// Bounds the resources consumed while validating a peer input: rejects a schema whose nesting depth
  /// exceeds the limit and a payload exceeding the size limit (spec §28.10, R-28.10-k, R-28.10-l;
  /// AC-44.28). The depth probe stops at the cap so a pathological self-referential schema cannot exhaust
  /// the stack while being measured. The payload-size check uses the UTF-8 byte length.
  /// </summary>
  /// <param name="schema">The schema to depth-bound, or <c>null</c> (R-28.10-k).</param>
  /// <param name="serializedPayload">An optional serialized payload whose size is bounded (R-28.10-l).</param>
  /// <param name="bounds">The bounds to enforce; defaults to <see cref="DefaultInputBounds"/>.</param>
  /// <returns>The validation outcome.</returns>
  public static InputBoundsValidation EnforceInputBounds(
    JsonNode? schema = null, string? serializedPayload = null, InputBounds? bounds = null)
  {
    var b = bounds ?? DefaultInputBounds;
    if (schema is not null)
    {
      var depth = SchemaNestingDepth(schema, b.MaxSchemaDepth + 1);
      if (depth > b.MaxSchemaDepth)
      {
        return new InputBoundsValidation(false, $"schema nesting depth exceeds the bound {b.MaxSchemaDepth} (R-28.10-k)");
      }
    }
    if (serializedPayload is not null)
    {
      var bytes = Encoding.UTF8.GetByteCount(serializedPayload);
      if (bytes > b.MaxPayloadBytes)
      {
        return new InputBoundsValidation(false, $"payload size {bytes}B exceeds the bound {b.MaxPayloadBytes}B (R-28.10-l)");
      }
    }
    return new InputBoundsValidation(true, null);
  }

  /// <summary>
  /// Returns the nesting depth of a JSON schema (objects/arrays), capping recursion at
  /// <paramref name="cap"/> so a pathological self-referential structure cannot exhaust the stack while
  /// being measured. A scalar has depth 0.
  /// </summary>
  private static int SchemaNestingDepth(JsonNode? node, int cap)
  {
    if (cap <= 0) return 0;
    switch (node)
    {
      case JsonObject obj:
        {
          var max = 0;
          foreach (var (_, value) in obj)
          {
            max = Math.Max(max, SchemaNestingDepth(value, cap - 1));
          }
          return 1 + max;
        }
      case JsonArray array:
        {
          var max = 0;
          foreach (var value in array)
          {
            max = Math.Max(max, SchemaNestingDepth(value, cap - 1));
          }
          return 1 + max;
        }
      default:
        return 0;
    }
  }

  /// <summary>Outcome of <see cref="AssertSelfContainedSchema"/>.</summary>
  /// <param name="Ok"><c>true</c> when the schema has no disallowed external <c>$ref</c>.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct SchemaSelfContainmentValidation(bool Ok, string? Reason);

  /// <summary>
  /// Asserts a tool schema is self-contained — it carries no external <c>$ref</c> that the server would
  /// have to dereference — unless external resolution is explicitly permitted against a trusted source
  /// (spec §28.10, R-28.10-m, R-28.10-n; AC-44.29). A pure structural inspection that performs no I/O. An
  /// in-document <c>$ref</c> (starting with <c>#</c>) is allowed.
  /// </summary>
  /// <param name="schema">The tool schema to inspect (R-28.10-m).</param>
  /// <param name="allowTrustedExternalRefs">Opt-in: external refs are resolved only against trusted sources (R-28.10-n). Default <c>false</c>.</param>
  /// <param name="maxDepth">Recursion bound; defaults to the schema-depth limit.</param>
  /// <returns>The validation outcome.</returns>
  public static SchemaSelfContainmentValidation AssertSelfContainedSchema(
    JsonNode? schema, bool allowTrustedExternalRefs = false, int? maxDepth = null)
  {
    if (allowTrustedExternalRefs) return new SchemaSelfContainmentValidation(true, null);
    if (HasExternalRef(schema, maxDepth ?? DefaultMaxSchemaDepth))
    {
      return new SchemaSelfContainmentValidation(false,
        "a server MUST NOT automatically dereference external schema references; schemas MUST be self-contained or resolved only against trusted sources (R-28.10-m, R-28.10-n)");
    }
    return new SchemaSelfContainmentValidation(true, null);
  }

  /// <summary>Returns <c>true</c> when a schema carries a <c>$ref</c>/<c>$dynamicRef</c> that is not an in-document fragment (spec R-28.10-m).</summary>
  private static bool HasExternalRef(JsonNode? node, int cap)
  {
    if (cap <= 0) return false;
    switch (node)
    {
      case JsonObject obj:
        foreach (var (key, value) in obj)
        {
          if ((key is "$ref" or "$dynamicRef") && value is JsonValue rv && rv.TryGetValue<string>(out var refStr) &&
              !refStr.StartsWith('#'))
          {
            return true;
          }
          if (HasExternalRef(value, cap - 1)) return true;
        }
        return false;
      case JsonArray array:
        foreach (var value in array)
        {
          if (HasExternalRef(value, cap - 1)) return true;
        }
        return false;
      default:
        return false;
    }
  }

  /// <summary>Outcome of <see cref="SanitizeFilePath"/>.</summary>
  /// <param name="Ok"><c>true</c> when the path stays within the authorized root.</param>
  /// <param name="ResolvedPath">The normalized resolved path on success, or <c>null</c>.</param>
  /// <param name="Reason">The failure reason when <paramref name="Ok"/> is <c>false</c>.</param>
  public readonly record struct FilePathValidation(bool Ok, string? ResolvedPath, string? Reason);

  /// <summary>
  /// Sanitizes a requested <c>file://</c> resource path against an authorized root, rejecting
  /// directory-traversal and any path that escapes the root (spec §28.10, R-28.10-o, R-28.10-p;
  /// AC-44.30). Purely lexical (no filesystem I/O): normalizes <c>.</c>/<c>..</c> segments POSIX-style and
  /// confirms the result stays within <paramref name="authorizedRoot"/>. A NUL byte is rejected outright.
  /// </summary>
  /// <param name="requestedPath">The requested file path (relative to, or under, the root) (R-28.10-o).</param>
  /// <param name="authorizedRoot">The absolute root directory the user has authorized (R-28.10-p).</param>
  /// <returns>The validation outcome.</returns>
  public static FilePathValidation SanitizeFilePath(string requestedPath, string authorizedRoot)
  {
    ArgumentNullException.ThrowIfNull(requestedPath);
    ArgumentNullException.ThrowIfNull(authorizedRoot);
    if (requestedPath.Contains('\0'))
    {
      return new FilePathValidation(false, null, "file path MUST NOT contain a NUL byte (R-28.10-o)");
    }
    var root = NormalizePosix(authorizedRoot);
    var joined = requestedPath.StartsWith('/')
      ? NormalizePosix(requestedPath)
      : NormalizePosix($"{root}/{requestedPath}");
    var rootWithSlash = root.EndsWith('/') ? root : $"{root}/";
    if (joined != root && !joined.StartsWith(rootWithSlash, StringComparison.Ordinal))
    {
      return new FilePathValidation(false, null,
        $"resolved path \"{joined}\" escapes the authorized root \"{root}\"; reject directory traversal (R-28.10-o, R-28.10-p)");
    }
    return new FilePathValidation(true, joined, null);
  }

  /// <summary>Normalizes a POSIX-style path, collapsing <c>.</c>/<c>..</c>/duplicate-slash segments. Lexical only.</summary>
  private static string NormalizePosix(string path)
  {
    var isAbsolute = path.StartsWith('/');
    var segments = new List<string>();
    foreach (var seg in path.Split('/'))
    {
      if (seg.Length == 0 || seg == ".") continue;
      if (seg == "..")
      {
        if (segments.Count > 0 && segments[^1] != "..")
        {
          segments.RemoveAt(segments.Count - 1);
        }
        else if (!isAbsolute)
        {
          segments.Add("..");
        }
        // For an absolute path, `..` above the root is clamped at the root.
        continue;
      }
      segments.Add(seg);
    }
    var body = string.Join('/', segments);
    return isAbsolute ? $"/{body}" : body;
  }
}

/// <summary>
/// A server-side store for <c>requestState</c> continuation tokens that protects their integrity and
/// confidentiality and guards against replay — the §28.6 handling profile (spec §28.6, R-28.6-a,
/// R-28.6-b, R-28.6-c; AC-44.18).
/// </summary>
/// <remarks>
/// The client only ever sees the opaque <c>value</c>; the state and integrity tag are held entirely
/// server-side (the "unguessable handle" design §28.6 permits). On presentation <see cref="Validate"/>
/// rejects — rather than acting on — a token that fails integrity (R-28.6-b), is expired, was already
/// consumed (single-use replay defense), or is unknown. <see cref="Issue"/> mints a single-use,
/// optionally time-bounded handle.
/// </remarks>
/// <typeparam name="TState">The server-held continuation-state type.</typeparam>
public sealed class ContinuationTokenStore<TState>
{
  private readonly Dictionary<string, Security.ContinuationTokenRecord<TState>> _byValue = new(StringComparer.Ordinal);
  private readonly Func<long> _now;
  private readonly Func<string> _mint;
  private int _counter;

  /// <summary>
  /// Creates a store with an optional injectable clock and value generator.
  /// </summary>
  /// <param name="now">An optional clock (epoch ms); defaults to <see cref="DateTimeOffset.UtcNow"/>.</param>
  /// <param name="mint">An optional unguessable-value generator; defaults to a monotonic random-ish handle. Inject a CSPRNG-backed generator in production.</param>
  public ContinuationTokenStore(Func<long>? now = null, Func<string>? mint = null)
  {
    _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    // A monotonic counter plus a random GUID yields an unguessable, never-colliding default handle.
    // (.NET's Convert.ToString supports only bases 2/8/10/16, so the counter is plain decimal.)
    _mint = mint ?? (() => $"rs_{_counter++}_{Guid.NewGuid():N}");
  }

  /// <summary>
  /// Mints a single-use continuation token for <paramref name="state"/>, with an optional integrity tag
  /// and time bound. The returned value is the opaque handle to give the client; the state never crosses
  /// the wire (spec R-28.6-a, R-28.6-c).
  /// </summary>
  /// <param name="state">The server-side continuation state to stash.</param>
  /// <param name="integrityTag">An optional signature/MAC the client must echo; defaults to the handle being its own integrity (R-28.6-a).</param>
  /// <param name="ttlMs">An optional time bound; the token expires after this many ms (R-28.6-c).</param>
  /// <returns>The minted token record.</returns>
  public Security.ContinuationTokenRecord<TState> Issue(TState state, string? integrityTag = null, long? ttlMs = null)
  {
    var value = _mint();
    var record = new Security.ContinuationTokenRecord<TState>(
      value,
      integrityTag ?? value,
      state,
      ttlMs is not null ? _now() + ttlMs.Value : null,
      false);
    _byValue[value] = record;
    return record;
  }

  /// <summary>
  /// Validates a presented continuation token, returning the protected state on success or a structured
  /// rejection (spec R-28.6-b, R-28.6-c). A receiver MUST reject (never act on) a token that fails
  /// integrity; replay (expiry or re-use) is refused too. A successful validation consumes the
  /// single-use token.
  /// </summary>
  /// <param name="value">The opaque token value the client presented.</param>
  /// <param name="presentedIntegrityTag">The integrity tag the client echoed, for a signed design; omit for an unguessable-handle design.</param>
  /// <returns>The validation outcome.</returns>
  public Security.ContinuationTokenValidation<TState> Validate(string value, string? presentedIntegrityTag = null)
  {
    if (!_byValue.TryGetValue(value, out var record))
    {
      return new Security.ContinuationTokenValidation<TState>(
        false, default, Security.ContinuationTokenFailure.Unknown,
        "continuation token is not recognized; reject rather than act on it (R-28.6-b)");
    }
    var actualTag = presentedIntegrityTag ?? value;
    if (!string.Equals(actualTag, record.IntegrityTag, StringComparison.Ordinal))
    {
      return new Security.ContinuationTokenValidation<TState>(
        false, default, Security.ContinuationTokenFailure.IntegrityFailure,
        "continuation token failed integrity validation; reject rather than act on its contents (R-28.6-b)");
    }
    if (record.ExpiresAtMs is not null && _now() >= record.ExpiresAtMs.Value)
    {
      _byValue.Remove(value);
      return new Security.ContinuationTokenValidation<TState>(
        false, default, Security.ContinuationTokenFailure.Expired,
        "continuation token has expired; refuse replay (R-28.6-c)");
    }
    if (record.Consumed)
    {
      return new Security.ContinuationTokenValidation<TState>(
        false, default, Security.ContinuationTokenFailure.Replayed,
        "continuation token was already used; refuse replay (single-use) (R-28.6-c)");
    }
    _byValue[value] = record with { Consumed = true };
    return new Security.ContinuationTokenValidation<TState>(true, record.State, Security.ContinuationTokenFailure.None, null);
  }
}

/// <summary>
/// A sliding-window rate limiter a server applies to <c>tools/call</c> so a hostile or malfunctioning
/// client cannot drive unbounded execution or downstream load (spec §28.3, R-28.3-g, R-28.3-h; AC-44.9).
/// </summary>
/// <remarks>
/// <see cref="Check"/> returns whether a call is within the limit; a server MUST reject (not execute) any
/// call that exceeds it (R-28.3-h) — use <see cref="Security.BuildRateLimitRejection"/> to build the
/// <c>-32600</c> error. The window is keyed by an opaque caller-chosen client/session id so per-peer
/// limits are independent. Time is injectable for testing.
/// </remarks>
public sealed class ToolCallRateLimiter
{
  private readonly int _maxInWindow;
  private readonly long _windowMs;
  private readonly Func<long> _now;
  private readonly Dictionary<string, List<long>> _hits = new(StringComparer.Ordinal);

  /// <summary>
  /// Creates a rate limiter.
  /// </summary>
  /// <param name="maxInWindow">The maximum permitted <c>tools/call</c> invocations per window per key; MUST be a positive integer (R-28.3-g).</param>
  /// <param name="windowMs">The sliding-window length in milliseconds; MUST be positive.</param>
  /// <param name="now">An optional clock (epoch ms); defaults to <see cref="DateTimeOffset.UtcNow"/>.</param>
  /// <exception cref="ArgumentOutOfRangeException">When <paramref name="maxInWindow"/> or <paramref name="windowMs"/> is not positive.</exception>
  public ToolCallRateLimiter(int maxInWindow, long windowMs, Func<long>? now = null)
  {
    if (maxInWindow < 1)
    {
      throw new ArgumentOutOfRangeException(nameof(maxInWindow), "maxInWindow MUST be a positive integer (R-28.3-g)");
    }
    if (windowMs <= 0)
    {
      throw new ArgumentOutOfRangeException(nameof(windowMs), "windowMs MUST be positive (R-28.3-g)");
    }
    _maxInWindow = maxInWindow;
    _windowMs = windowMs;
    _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
  }

  /// <summary>Outcome of <see cref="Check"/>.</summary>
  /// <param name="Allowed"><c>true</c> when the call is within the limit.</param>
  /// <param name="RetryAfterMs">When rejected, a hint for when the client may retry; otherwise <c>0</c>.</param>
  public readonly record struct RateLimitDecision(bool Allowed, long RetryAfterMs);

  private List<long> Pruned(string key, long now)
  {
    var cutoff = now - _windowMs;
    var kept = (_hits.TryGetValue(key, out var existing) ? existing : []).Where(t => t > cutoff).ToList();
    _hits[key] = kept;
    return kept;
  }

  /// <summary>
  /// Records and evaluates one <c>tools/call</c> for <paramref name="key"/>. Returns
  /// <c>Allowed = true</c> when within the limit, or <c>Allowed = false</c> with a back-off hint when it
  /// exceeds it and MUST be rejected rather than executed (R-28.3-h). A rejected call is NOT counted
  /// toward the window, so a flood cannot extend the back-off indefinitely.
  /// </summary>
  /// <param name="key">An opaque client/session identifier.</param>
  /// <returns>The rate-limit decision.</returns>
  public RateLimitDecision Check(string key)
  {
    ArgumentNullException.ThrowIfNull(key);
    var now = _now();
    var recent = Pruned(key, now);
    if (recent.Count >= _maxInWindow)
    {
      var oldest = recent[0];
      var retryAfterMs = Math.Max(0, oldest + _windowMs - now);
      return new RateLimitDecision(false, retryAfterMs);
    }
    recent.Add(now);
    _hits[key] = recent;
    return new RateLimitDecision(true, 0);
  }
}
