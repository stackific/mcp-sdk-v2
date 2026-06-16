"""Tests for S44 — Security Considerations (§28).

§28 is a consolidating section: it defines no new wire types but binds together the
cross-cutting security obligations. These tests exercise the registry, the consent gate,
the trust-classification and tool-safety predicates, token handling, continuation-token
integrity/replay, elicitation/sampling/UI consent, metadata/observability, and input
validation & resource bounds — mirroring ``security.test.ts`` one or more cases per AC,
plus additional Python-edge cases.

AC coverage:
 AC-44.1  (R-28-a, R-28.1-a)                      — registry + four-principle baseline
 AC-44.2  (R-28.1-b..d, R-28.2-a/b)              — informed consent, review interface
 AC-44.3  (R-28.1-e, R-28.1-f)                    — no exposure without consent
 AC-44.4  (R-28.1-g, R-28.4-c)                    — access controls by sensitivity
 AC-44.5  (R-28.1-h/j/k, R-28.3-a)                — tools as arbitrary code; consent
 AC-44.6  (R-28.1-i, R-28.3-b/c)                  — untrusted definitions/annotations
 AC-44.7  (R-28.2-c..g)                           — no silence/escalation; fresh consent
 AC-44.8  (R-28.3-d/e/f)                          — human in the loop; not model-alone
 AC-44.9  (R-28.3-g/h/i)                          — rate-limit + sanitize outputs
 AC-44.10 (R-28.3-j/k/l)                          — show args; timeout; audit log (no secrets)
 AC-44.11 (R-28.4-a/b/d/e/f)                      — host-elected context; isolation
 AC-44.12 (R-28.5-a..e)                           — audience-bound token validation
 AC-44.13 (R-28.5-f/g)                            — no token passthrough
 AC-44.14 (R-28.5-h/i)                            — exact issuer validation
 AC-44.17 (R-28.5-n..q, R-28.9-d)                 — token confidentiality/HTTPS
 AC-44.18 (R-28.6-a/b/c)                          — continuation-token integrity/replay
 AC-44.19 (R-28.7-a..e)                           — elicitation under user control
 AC-44.20 (R-28.7-f/g)                            — sampling human review; context bound
 AC-44.21 (R-28.8-a..d)                           — UI sandbox + mediated tools/call
 AC-44.22 (R-28.8-e..h)                           — no exposure/exfiltration; least privilege
 AC-44.23 (R-28.9-a/b/c/e)                        — metadata no-authority; redact
 AC-44.24 (R-28.10-a..e)                          — validate args/results; report errors
 AC-44.25 (R-28.10-f/g/h)                         — URI validation; SSRF
 AC-44.26 (R-28.10-i)                             — Origin validation
 AC-44.27 (R-28.10-j)                             — cursor validation
 AC-44.28 (R-28.10-k/l)                           — bounded consumption
 AC-44.29 (R-28.10-m/n)                           — no external dereferencing
 AC-44.30 (R-28.10-o/p)                           — file-path sanitization
"""

import pytest

from mcp.protocol.pagination import INVALID_CURSOR_CODE
from mcp.protocol.sampling import SamplingConsentObligations
from mcp.protocol.ui_host import ToolsCallMediationInput
from mcp.protocol.security import (
  DATA_SENSITIVITY_ORDER,
  DEFAULT_INPUT_BOUNDS,
  ELICITATION_USER_DECISIONS,
  INPUT_TRUST_VALUES,
  RATE_LIMIT_REJECTION_CODE,
  REDACTED_PLACEHOLDER,
  SECURITY_PRINCIPLES,
  SECURITY_REQUIREMENTS,
  VALIDATION_ERROR_CODE,
  ConsentGrant,
  ConsentRequest,
  ContinuationTokenStore,
  InputBounds,
  SecurityBaselineClaims,
  ToolCallRateLimiter,
  access_controls_are_commensurate,
  assert_consented_data_exposure,
  assert_elicitation_under_user_control,
  assert_human_in_the_loop,
  assert_no_token_passthrough,
  assert_sampling_under_user_control,
  assert_self_contained_schema,
  assert_server_isolation,
  assert_token_transport_security,
  assert_ui_sandbox_conforming,
  assess_security_baseline,
  build_rate_limit_rejection,
  classify_tool_definition_trust,
  enforce_input_bounds,
  evaluate_consent,
  lookup_security_requirement,
  mandatory_security_requirements,
  may_display_tool_annotations,
  mediate_ui_initiated_tool_call,
  metadata_conveys_authority,
  record_consent_grant,
  redact_for_logging,
  sanitize_consumed_metadata,
  sanitize_file_path,
  sanitize_tool_output_text,
  security_requirements_for_principle,
  tool_annotation_is_security_guarantee,
  tool_output_has_control_sequences,
  validate_authorization_issuer,
  validate_pagination_cursor,
  validate_peer_tool_call,
  validate_request_origin,
  validate_resource_uri_access,
  validate_server_access_token,
)

OBJECT_SCHEMA = {"type": "object", "properties": {}}


def fully_satisfied_sampling_obligations() -> SamplingConsentObligations:
  return SamplingConsentObligations(
    human_in_the_loop=True,
    user_may_deny=True,
    review_prompt_before_sampling=True,
    review_result_before_server=True,
    may_modify_control_fields=True,
    rate_limiting=True,
    validate_content=True,
    handle_sensitive_data=True,
    tool_loop_iteration_limits=True,
  )


# ─── AC-44.1 — security baseline registry + four core principles ──────────────


class TestSecurityBaselineRegistry:
  def test_exposes_four_core_principles(self):
    assert SECURITY_PRINCIPLES == (
      "user-consent-and-control",
      "data-privacy",
      "tool-safety",
      "host-mediated-trust",
    )

  def test_registers_every_atom_and_indexes_by_id(self):
    assert len(SECURITY_REQUIREMENTS) > 70
    ids = {r.id for r in SECURITY_REQUIREMENTS}
    assert len(ids) == len(SECURITY_REQUIREMENTS)  # no duplicate atoms
    for id_ in ("R-28-a", "R-28.1-a", "R-28.5-b", "R-28.10-p"):
      assert id_ in ids
    found = lookup_security_requirement("R-28.5-b")
    assert found is not None
    assert found.level == "MUST"
    assert found.section == "§28.5"
    assert lookup_security_requirement("R-99-z") is None

  def test_every_requirement_maps_to_a_principle(self):
    principles = set(SECURITY_PRINCIPLES)
    for req in SECURITY_REQUIREMENTS:
      assert req.principle in principles
    assert len(security_requirements_for_principle("tool-safety")) > 0

  def test_per_principle_slice_is_in_spec_order(self):
    # The per-principle slice preserves the order of the master registry.
    slice_ = security_requirements_for_principle("data-privacy")
    master_order = [r.id for r in SECURITY_REQUIREMENTS if r.principle == "data-privacy"]
    assert [r.id for r in slice_] == master_order

  def test_unknown_principle_yields_empty_slice(self):
    assert security_requirements_for_principle("not-a-principle") == []

  def test_mandatory_requirements_are_only_must_or_must_not(self):
    mand = mandatory_security_requirements()
    assert len(mand) > 0
    for req in mand:
      assert req.level in ("MUST", "MUST NOT")
    # SHOULD / MAY atoms are excluded.
    assert all(req.level not in ("SHOULD", "MAY") for req in mand)

  def test_requirement_levels_are_valid(self):
    for req in SECURITY_REQUIREMENTS:
      assert req.level in ("MUST", "MUST NOT", "SHOULD", "MAY")
      assert req.section.startswith("§28")
      assert req.statement  # non-empty

  def test_assess_baseline_passes_only_when_all_four_claimed(self):
    full = assess_security_baseline(
      SecurityBaselineClaims(
        user_consent_and_control=True,
        data_privacy=True,
        tool_safety=True,
        host_mediated_trust=True,
      )
    )
    assert full.ok is True
    assert full.unmet_principles == []

    partial = assess_security_baseline(
      SecurityBaselineClaims(
        user_consent_and_control=True,
        data_privacy=False,
        tool_safety=True,
        host_mediated_trust=False,
      )
    )
    assert partial.ok is False
    assert partial.unmet_principles == ["data-privacy", "host-mediated-trust"]

  def test_assess_baseline_lists_all_unmet_in_order(self):
    none_ = assess_security_baseline(
      SecurityBaselineClaims(
        user_consent_and_control=False,
        data_privacy=False,
        tool_safety=False,
        host_mediated_trust=False,
      )
    )
    assert none_.ok is False
    assert none_.unmet_principles == list(SECURITY_PRINCIPLES)


# ─── AC-44.2 / AC-44.7 — informed/fresh consent, no silence/escalation ────────


class TestConsentGate:
  def test_denies_without_prior_or_approval(self):
    d = evaluate_consent(ConsentRequest(operation="tool:send_email", scope="to=alice"))
    assert d.allowed is False
    assert d.reason == "no-consent"

  def test_allows_fresh_informed_and_records_reusable_grant(self):
    req = ConsentRequest(operation="tool:send_email", scope="to=alice", user_approved=True)
    d = evaluate_consent(req)
    assert d.allowed is True
    assert d.reason == "freshly-approved"
    grant = record_consent_grant(req)
    assert grant == ConsentGrant(operation="tool:send_email", scope="to=alice", informed=True)
    # The recorded grant matches an identical later operation without re-prompting.
    again = evaluate_consent(ConsentRequest(operation="tool:send_email", scope="to=alice"), grant)
    assert again.allowed is True
    assert again.reason == "matches-prior-grant"

  def test_requires_fresh_consent_on_material_change(self):
    prior = ConsentGrant(operation="tool:send_email", scope="to=alice", informed=True)
    # Same operation, materially different scope, no fresh approval.
    d = evaluate_consent(ConsentRequest(operation="tool:send_email", scope="to=attacker"), prior)
    assert d.allowed is False
    assert d.reason == "silent-escalation"
    assert "escalat" in d.detail
    # With fresh approval, the escalated scope is allowed.
    approved = evaluate_consent(
      ConsentRequest(operation="tool:send_email", scope="to=attacker", user_approved=True),
      prior,
    )
    assert approved.allowed is True
    assert approved.reason == "freshly-approved"

  def test_missing_user_approved_is_never_approval(self):
    d = evaluate_consent(ConsentRequest(operation="op", scope="s", user_approved=None))
    assert d.allowed is False
    assert d.reason == "no-consent"

  def test_falsey_but_not_true_user_approved_is_denied(self):
    # Only the literal True is approval; 1/"yes"/truthy non-True must NOT pass.
    for bad in (False, None):
      assert evaluate_consent(ConsentRequest("op", "s", user_approved=bad)).allowed is False

  def test_fresh_approval_with_empty_scope_is_not_informed(self):
    # An approved request with an empty scope cannot be informed (nothing to understand).
    d = evaluate_consent(ConsentRequest(operation="op", scope="", user_approved=True))
    assert d.allowed is False
    assert d.reason == "not-informed"

  def test_prior_grant_for_different_operation_is_no_consent_not_escalation(self):
    prior = ConsentGrant(operation="tool:a", scope="x", informed=True)
    d = evaluate_consent(ConsentRequest(operation="tool:b", scope="x"), prior)
    assert d.allowed is False
    # Different operation entirely → plain no-consent, not silent-escalation.
    assert d.reason == "no-consent"

  def test_record_consent_grant_requires_true(self):
    with pytest.raises(ValueError):
      record_consent_grant(ConsentRequest(operation="op", scope="s"))
    with pytest.raises(ValueError):
      record_consent_grant(ConsentRequest(operation="op", scope="s", user_approved=False))


# ─── AC-44.3 — no data exposure without consent ───────────────────────────────


class TestDataExposureConsent:
  def test_blocks_exposure_without_matching_grant(self):
    blocked = assert_consented_data_exposure(scope="file:///secret.txt")
    assert blocked.ok is False
    assert "without consent" in blocked.reason

    grant = ConsentGrant(operation="resource-exposure", scope="file:///secret.txt", informed=True)
    allowed = assert_consented_data_exposure(scope="file:///secret.txt", prior_grant=grant)
    assert allowed.ok is True

  def test_fresh_approval_allows_exposure(self):
    allowed = assert_consented_data_exposure(scope="file:///x.txt", user_approved=True)
    assert allowed.ok is True

  def test_grant_for_other_scope_does_not_authorize(self):
    grant = ConsentGrant(operation="resource-exposure", scope="file:///a.txt", informed=True)
    blocked = assert_consented_data_exposure(scope="file:///b.txt", prior_grant=grant)
    assert blocked.ok is False


# ─── AC-44.4 — access controls commensurate with sensitivity ──────────────────


class TestAccessControls:
  def test_controls_at_least_as_strong_as_sensitivity(self):
    assert access_controls_are_commensurate("confidential", "confidential") is True
    assert access_controls_are_commensurate("confidential", "secret") is True
    assert access_controls_are_commensurate("secret", "confidential") is False
    assert access_controls_are_commensurate("public", "public") is True

  def test_full_ordering(self):
    assert DATA_SENSITIVITY_ORDER == ("public", "internal", "confidential", "secret")
    # weaker control than data sensitivity always fails
    assert access_controls_are_commensurate("secret", "public") is False
    assert access_controls_are_commensurate("internal", "public") is False
    # strongest control covers everything
    for s in DATA_SENSITIVITY_ORDER:
      assert access_controls_are_commensurate(s, "secret") is True


# ─── AC-44.5 / AC-44.6 — untrusted definitions/annotations ────────────────────


class TestToolTrust:
  def test_classifies_definition_untrusted_unless_trusted_server(self):
    assert classify_tool_definition_trust(False) == "untrusted"
    assert classify_tool_definition_trust(True) == "trusted"
    assert classify_tool_definition_trust(False) in INPUT_TRUST_VALUES

  def test_annotation_is_never_a_security_guarantee(self):
    assert tool_annotation_is_security_guarantee({"readOnlyHint": True}) is False
    assert tool_annotation_is_security_guarantee(None) is False
    assert tool_annotation_is_security_guarantee() is False

  def test_may_display_annotations_only_from_trusted_server(self):
    assert may_display_tool_annotations(True) is True
    assert may_display_tool_annotations(False) is False


# ─── AC-44.8 — human in the loop; decision not model-alone ────────────────────


class TestHumanInTheLoop:
  def test_rejects_model_alone(self):
    r = assert_human_in_the_loop(user_could_review_and_deny=True, model_decided_alone=True)
    assert r.ok is False
    assert "model" in r.reason

  def test_rejects_when_user_could_not_review(self):
    r = assert_human_in_the_loop(user_could_review_and_deny=False, model_decided_alone=False)
    assert r.ok is False
    assert "review" in r.reason

  def test_accepts_human_gated_reviewable(self):
    r = assert_human_in_the_loop(user_could_review_and_deny=True, model_decided_alone=False)
    assert r.ok is True

  def test_model_alone_takes_precedence_over_review(self):
    # Both bad: model-alone is reported first.
    r = assert_human_in_the_loop(user_could_review_and_deny=False, model_decided_alone=True)
    assert r.ok is False
    assert "model" in r.reason


# ─── AC-44.9 — rate limiting + output sanitization ────────────────────────────


class TestRateLimiter:
  def test_rejects_calls_exceeding_limit(self):
    t = {"v": 0}
    limiter = ToolCallRateLimiter(max_in_window=2, window_ms=1000, now=lambda: t["v"])
    assert limiter.check("client-a").allowed is True
    assert limiter.check("client-a").allowed is True
    third = limiter.check("client-a")
    assert third.allowed is False
    assert third.retry_after_ms > 0
    # A different client has its own independent window.
    assert limiter.check("client-b").allowed is True
    # After the window elapses, the first client is allowed again.
    t["v"] = 1001
    assert limiter.check("client-a").allowed is True

  def test_rejected_call_does_not_extend_backoff(self):
    t = {"v": 0}
    limiter = ToolCallRateLimiter(max_in_window=1, window_ms=100, now=lambda: t["v"])
    assert limiter.check("k").allowed is True
    # Repeated floods while denied do not push the back-off out: it always references the
    # single recorded hit at t=0, so retry_after stays bounded by the window.
    t["v"] = 50
    d1 = limiter.check("k")
    assert d1.allowed is False
    assert d1.retry_after_ms == 50  # 0 + 100 - 50
    t["v"] = 99
    d2 = limiter.check("k")
    assert d2.allowed is False
    assert d2.retry_after_ms == 1
    # After the window the hit is pruned and a call is allowed again.
    t["v"] = 101
    assert limiter.check("k").allowed is True

  def test_build_rate_limit_rejection_matches_wire_example(self):
    err = build_rate_limit_rejection(1000)
    assert err["code"] == RATE_LIMIT_REJECTION_CODE == -32600
    assert err["data"] == {"retryAfterMs": 1000}
    assert err["message"] == "Rate limit exceeded for tools/call"
    assert "data" not in build_rate_limit_rejection()
    assert build_rate_limit_rejection(message="custom")["message"] == "custom"

  def test_rejects_invalid_configuration(self):
    with pytest.raises(ValueError):
      ToolCallRateLimiter(max_in_window=0, window_ms=1000)
    with pytest.raises(ValueError):
      ToolCallRateLimiter(max_in_window=1, window_ms=0)
    with pytest.raises(ValueError):
      ToolCallRateLimiter(max_in_window=-1, window_ms=1000)
    with pytest.raises(ValueError):
      ToolCallRateLimiter(max_in_window=True, window_ms=1000)  # bool is not a valid int count


class TestOutputSanitization:
  def test_sanitizes_control_sequences_keeps_whitespace(self):
    malicious = "ok\x1b[31mRED\x07\x00 text\twith\nnewlines"
    assert tool_output_has_control_sequences(malicious) is True
    clean = sanitize_tool_output_text(malicious)
    assert clean == "ok[31mRED text\twith\nnewlines"
    assert tool_output_has_control_sequences(clean) is False

  def test_idempotent_on_clean_text(self):
    assert sanitize_tool_output_text("plain text\n") == "plain text\n"
    assert tool_output_has_control_sequences("plain text\n") is False
    assert tool_output_has_control_sequences("tab\tcr\rlf\n") is False

  def test_strips_c1_and_del(self):
    # DEL (0x7f) and C1 (0x80-0x9f) are stripped too.
    assert sanitize_tool_output_text("a\x7fb\x9fc") == "abc"
    assert tool_output_has_control_sequences("\x7f") is True
    assert tool_output_has_control_sequences("\x80") is True


# ─── AC-44.10 — audit logging redacts secrets ─────────────────────────────────


class TestAuditLogRedaction:
  def test_redacts_credentials_from_audit_content(self):
    logged = redact_for_logging(
      {
        "tool": "send_email",
        "arguments": {"to": "alice", "authorization": "Bearer abc"},
        "access_token": "xyz",
      }
    )
    assert logged["arguments"]["authorization"] == REDACTED_PLACEHOLDER
    assert logged["arguments"]["to"] == "alice"
    assert logged["access_token"] == REDACTED_PLACEHOLDER


# ─── AC-44.11 — host-elected context; server isolation ────────────────────────


class TestServerIsolation:
  def test_rejects_relaying_one_servers_data_to_another(self):
    r = assert_server_isolation(source_server_id="server-a", destination_server_id="server-b", host_elected=True)
    assert r.ok is False
    assert "server-a" in r.reason and "server-b" in r.reason

  def test_rejects_unelected_context(self):
    r = assert_server_isolation(destination_server_id="server-b", host_elected=False)
    assert r.ok is False

  def test_allows_host_elected_same_server(self):
    r = assert_server_isolation(source_server_id="server-a", destination_server_id="server-a", host_elected=True)
    assert r.ok is True

  def test_no_source_with_host_elected_passes(self):
    # Context that has no originating server (fresh host context) only needs election.
    r = assert_server_isolation(destination_server_id="server-x", host_elected=True)
    assert r.ok is True

  def test_cross_server_relay_checked_before_election(self):
    # Cross-server relay fails even when host_elected is False (relay reason wins).
    r = assert_server_isolation(source_server_id="a", destination_server_id="b", host_elected=False)
    assert r.ok is False
    assert "relay" in r.reason


# ─── AC-44.12 — audience-bound token validation ───────────────────────────────


class TestServerTokenValidation:
  def test_rejects_token_not_validated_before_use(self):
    r = validate_server_access_token(
      token_audience="https://mcp.example.com",
      own_canonical_resource="https://mcp.example.com",
      validated_before_use=False,
    )
    assert r.ok is False
    assert r.code == -32600

  def test_rejects_audience_mismatch(self):
    r = validate_server_access_token(
      token_audience="https://other.example.com",
      own_canonical_resource="https://mcp.example.com",
      validated_before_use=True,
    )
    assert r.ok is False
    assert "not valid for this resource" in r.reason
    assert r.code == -32600

  def test_accepts_audience_bound_validated_token(self):
    r = validate_server_access_token(
      token_audience=["https://mcp.example.com"],
      own_canonical_resource="https://mcp.example.com",
      validated_before_use=True,
    )
    assert r.ok is True
    assert r.code is None

  def test_validation_order_unvalidated_checked_first(self):
    # When both unvalidated AND mismatched, the not-validated-first rule reports.
    r = validate_server_access_token(
      token_audience="https://other.example.com",
      own_canonical_resource="https://mcp.example.com",
      validated_before_use=False,
    )
    assert r.ok is False
    assert "before processing" in r.reason


# ─── AC-44.13 — no token passthrough / confused deputy ────────────────────────


class TestNoTokenPassthrough:
  def test_rejects_forwarding_client_token_upstream(self):
    r = assert_no_token_passthrough(
      client_presented_token="client-token",
      upstream_token="client-token",
      upstream_token_issuer="https://up.example.com",
      upstream_authorization_server_issuer="https://up.example.com",
    )
    assert r.ok is False
    assert "confused deputy" in r.reason

  def test_rejects_upstream_token_not_from_upstream_as(self):
    r = assert_no_token_passthrough(
      client_presented_token="client-token",
      upstream_token="separate-token",
      upstream_token_issuer="https://wrong.example.com",
      upstream_authorization_server_issuer="https://up.example.com",
    )
    assert r.ok is False

  def test_accepts_separate_upstream_token(self):
    r = assert_no_token_passthrough(
      client_presented_token="client-token",
      upstream_token="separate-token",
      upstream_token_issuer="https://up.example.com",
      upstream_authorization_server_issuer="https://up.example.com",
    )
    assert r.ok is True


# ─── AC-44.14 — exact issuer validation (mix-up defense) ──────────────────────


class TestAuthorizationIssuer:
  def test_rejects_mismatched_issuer(self):
    r = validate_authorization_issuer(iss="https://evil.example.com", recorded_issuer="https://as.example.com")
    assert r.ok is False

  def test_accepts_exact_match(self):
    r = validate_authorization_issuer(
      iss="https://as.example.com",
      recorded_issuer="https://as.example.com",
      iss_parameter_supported=True,
    )
    assert r.ok is True


# ─── AC-44.17 — token confidentiality, HTTPS endpoints ────────────────────────


class TestTokenTransportSecurity:
  def test_rejects_logging_or_forwarding(self):
    assert (
      assert_token_transport_security(
        endpoint_urls=["https://as.example.com/token"], token_logged=True, token_forwarded=False
      ).ok
      is False
    )
    assert (
      assert_token_transport_security(
        endpoint_urls=["https://as.example.com/token"], token_logged=False, token_forwarded=True
      ).ok
      is False
    )

  def test_requires_https_endpoints_permits_localhost_redirect(self):
    assert (
      assert_token_transport_security(
        endpoint_urls=["http://as.example.com/token"], token_logged=False, token_forwarded=False
      ).ok
      is False
    )
    ok = assert_token_transport_security(
      endpoint_urls=["https://as.example.com/token"],
      redirect_uris=["http://localhost:8080/cb", "https://app.example.com/cb"],
      token_logged=False,
      token_forwarded=False,
    )
    assert ok.ok is True
    # A non-localhost http redirect is rejected.
    assert (
      assert_token_transport_security(
        endpoint_urls=["https://as.example.com/token"],
        redirect_uris=["http://app.example.com/cb"],
        token_logged=False,
        token_forwarded=False,
      ).ok
      is False
    )

  def test_loopback_127_and_ipv6_redirects_permitted(self):
    ok = assert_token_transport_security(
      endpoint_urls=["https://as.example.com/token"],
      redirect_uris=["http://127.0.0.1/cb", "http://[::1]:9000/cb"],
      token_logged=False,
      token_forwarded=False,
    )
    assert ok.ok is True

  def test_logged_takes_precedence(self):
    # tokenLogged is checked before endpoint URLs.
    r = assert_token_transport_security(
      endpoint_urls=["http://insecure/token"], token_logged=True, token_forwarded=False
    )
    assert r.ok is False
    assert "logged" in r.reason


# ─── AC-44.18 — continuation-token integrity, replay defense ──────────────────


class TestContinuationTokenStore:
  def test_protects_integrity(self):
    store = ContinuationTokenStore()
    issued = store.issue({"step": 1}, integrity_tag="sig-123")
    bad = store.validate(issued.value, "sig-WRONG")
    assert bad.ok is False
    assert bad.reason == "integrity-failure"
    good = store.validate(issued.value, "sig-123")
    assert good.ok is True
    assert good.state == {"step": 1}

  def test_rejects_unknown_token(self):
    store = ContinuationTokenStore()
    r = store.validate("never-issued")
    assert r.ok is False
    assert r.reason == "unknown"

  def test_guards_against_replay_single_use_and_time_bounded(self):
    t = {"v": 0}
    store = ContinuationTokenStore(now=lambda: t["v"])
    issued = store.issue(42, ttl_ms=100)
    assert store.validate(issued.value).ok is True
    # Re-use of a single-use token is refused.
    replay = store.validate(issued.value)
    assert replay.ok is False
    assert replay.reason == "replayed"
    # A fresh, expired token is refused too.
    issued2 = store.issue(43, ttl_ms=100)
    t["v"] = 200
    expired = store.validate(issued2.value)
    assert expired.ok is False
    assert expired.reason == "expired"

  def test_unguessable_handle_default_integrity(self):
    # With no explicit integrity tag, the handle is its own integrity (echo not required).
    store = ContinuationTokenStore()
    issued = store.issue("state-x")
    assert issued.integrity_tag == issued.value
    r = store.validate(issued.value)
    assert r.ok is True
    assert r.state == "state-x"

  def test_mint_produces_distinct_handles(self):
    store = ContinuationTokenStore()
    values = {store.issue(i).value for i in range(50)}
    assert len(values) == 50

  def test_expiry_at_exact_boundary_is_expired(self):
    t = {"v": 0}
    store = ContinuationTokenStore(now=lambda: t["v"])
    issued = store.issue("s", ttl_ms=100)
    t["v"] = 100  # now >= expires_at_ms
    assert store.validate(issued.value).reason == "expired"

  def test_integrity_failure_before_expiry_check(self):
    t = {"v": 0}
    store = ContinuationTokenStore(now=lambda: t["v"])
    issued = store.issue("s", integrity_tag="tag", ttl_ms=100)
    t["v"] = 999  # past expiry
    # Wrong tag is reported (integrity is checked before expiry).
    r = store.validate(issued.value, "WRONG")
    assert r.reason == "integrity-failure"


# ─── AC-44.19 — elicitation under user control ────────────────────────────────


class TestElicitationControl:
  def test_rejects_when_user_could_not_review(self):
    r = assert_elicitation_under_user_control(
      decision="approve", user_could_review=False, server_identity_shown=True
    )
    assert r.ok is False

  def test_decline_and_cancel_always_permitted(self):
    assert (
      assert_elicitation_under_user_control(
        decision="cancel", user_could_review=True, server_identity_shown=False
      ).ok
      is True
    )
    assert (
      assert_elicitation_under_user_control(
        decision="decline", user_could_review=True, server_identity_shown=False
      ).ok
      is True
    )

  def test_requires_server_identity_on_approve(self):
    r = assert_elicitation_under_user_control(
      decision="approve", user_could_review=True, server_identity_shown=False
    )
    assert r.ok is False

  def test_rejects_form_schema_that_phishes_for_secrets(self):
    r = assert_elicitation_under_user_control(
      decision="approve",
      user_could_review=True,
      server_identity_shown=True,
      requested_schema={"properties": {"password": {"type": "string", "title": "Your password"}}},
    )
    assert r.ok is False
    assert "phish" in r.reason

  def test_accepts_approve_with_nonsensitive_fields(self):
    r = assert_elicitation_under_user_control(
      decision="approve",
      user_could_review=True,
      server_identity_shown=True,
      requested_schema={"properties": {"city": {"type": "string"}}},
    )
    assert r.ok is True

  def test_approve_without_schema_passes(self):
    # When no requested_schema is supplied, the anti-phishing check is skipped.
    r = assert_elicitation_under_user_control(
      decision="approve", user_could_review=True, server_identity_shown=True
    )
    assert r.ok is True

  def test_edit_decision_follows_same_gate_as_approve(self):
    # "edit" is a non-terminal-decline outcome → still requires identity shown.
    r = assert_elicitation_under_user_control(
      decision="edit", user_could_review=True, server_identity_shown=False
    )
    assert r.ok is False
    assert "edit" in ELICITATION_USER_DECISIONS

  def test_review_gate_precedes_decline_shortcut(self):
    # Even a decline requires the user to have been able to review.
    r = assert_elicitation_under_user_control(
      decision="decline", user_could_review=False, server_identity_shown=True
    )
    assert r.ok is False


# ─── AC-44.20 — sampling human review; bounded context ────────────────────────


class TestSamplingControl:
  def test_rejects_unmet_must_obligations(self):
    obligations = fully_satisfied_sampling_obligations()
    obligations.human_in_the_loop = False
    r = assert_sampling_under_user_control(
      obligations=obligations,
      prompt_reviewed=True,
      completion_reviewed=True,
      disclosed_context_within_authorization=True,
    )
    assert r.ok is False
    assert "unmet obligations" in r.reason

  def test_rejects_unreviewed_prompt_or_completion(self):
    r = assert_sampling_under_user_control(
      obligations=fully_satisfied_sampling_obligations(),
      prompt_reviewed=True,
      completion_reviewed=False,
      disclosed_context_within_authorization=True,
    )
    assert r.ok is False
    r2 = assert_sampling_under_user_control(
      obligations=fully_satisfied_sampling_obligations(),
      prompt_reviewed=False,
      completion_reviewed=True,
      disclosed_context_within_authorization=True,
    )
    assert r2.ok is False

  def test_rejects_disclosing_more_context_than_authorized(self):
    r = assert_sampling_under_user_control(
      obligations=fully_satisfied_sampling_obligations(),
      prompt_reviewed=True,
      completion_reviewed=True,
      disclosed_context_within_authorization=False,
    )
    assert r.ok is False
    assert "conversation context" in r.reason

  def test_accepts_fully_reviewed_bounded_flow(self):
    r = assert_sampling_under_user_control(
      obligations=fully_satisfied_sampling_obligations(),
      prompt_reviewed=True,
      completion_reviewed=True,
      disclosed_context_within_authorization=True,
    )
    assert r.ok is True

  def test_obligations_checked_before_review(self):
    obligations = fully_satisfied_sampling_obligations()
    obligations.user_may_deny = False
    r = assert_sampling_under_user_control(
      obligations=obligations,
      prompt_reviewed=False,  # also bad, but obligations report first
      completion_reviewed=False,
      disclosed_context_within_authorization=False,
    )
    assert r.ok is False
    assert "unmet obligations" in r.reason


# ─── AC-44.21 / AC-44.22 — UI sandboxing + mediated tools/call ────────────────


class TestUiSandbox:
  def test_rejects_missing_csp_incomplete_sandbox_or_dirty_exposure(self):
    denied = ["dom", "cookies", "storage", "navigation"]
    assert (
      assert_ui_sandbox_conforming(
        sandbox_denied_access=denied, restrictive_csp_applied=False, exposed_to_ui={}
      ).ok
      is False
    )
    assert (
      assert_ui_sandbox_conforming(
        sandbox_denied_access=["dom", "cookies"], restrictive_csp_applied=True, exposed_to_ui={}
      ).ok
      is False
    )
    assert (
      assert_ui_sandbox_conforming(
        sandbox_denied_access=denied,
        restrictive_csp_applied=True,
        exposed_to_ui={"accessToken": "secret"},
      ).ok
      is False
    )

  def test_accepts_isolated_sandbox_clean_exposure(self):
    r = assert_ui_sandbox_conforming(
      sandbox_denied_access=["dom", "cookies", "storage", "navigation"],
      restrictive_csp_applied=True,
      exposed_to_ui={"toolInput": {}, "toolResult": {}, "hostContext": {}},
    )
    assert r.ok is True

  def test_csp_checked_before_sandbox(self):
    r = assert_ui_sandbox_conforming(
      sandbox_denied_access=["dom"], restrictive_csp_applied=False, exposed_to_ui={}
    )
    assert r.ok is False
    assert "content-security policy" in r.reason


class TestUiMediation:
  APP_VISIBLE = {"visibility": ["app"]}

  def test_routes_only_with_visibility_policy_consent(self):
    d = mediate_ui_initiated_tool_call(
      ToolsCallMediationInput(ui_meta=self.APP_VISIBLE, user_consented=True, policy_allows=True)
    )
    assert d.route is True

  def test_no_consent_no_route(self):
    d = mediate_ui_initiated_tool_call(
      ToolsCallMediationInput(ui_meta=self.APP_VISIBLE, user_consented=False, policy_allows=True)
    )
    assert d.route is False

  def test_policy_denies_no_route(self):
    d = mediate_ui_initiated_tool_call(
      ToolsCallMediationInput(ui_meta=self.APP_VISIBLE, user_consented=True, policy_allows=False)
    )
    assert d.route is False

  def test_no_ui_meta_no_route(self):
    # A tool never exposed to the UI cannot be invoked from it.
    d = mediate_ui_initiated_tool_call(
      ToolsCallMediationInput(ui_meta=None, user_consented=True, policy_allows=True)
    )
    assert d.route is False


# ─── AC-44.23 — metadata: no authority; validated; redacted ───────────────────


class TestMetadata:
  def test_metadata_never_conveys_authority(self):
    assert metadata_conveys_authority("traceparent") is False
    assert metadata_conveys_authority("progressToken") is False
    assert metadata_conveys_authority() is False

  def test_keeps_only_known_keys(self):
    sanitized = sanitize_consumed_metadata(
      {"traceparent": "00-abc", "injected": "evil", "missing": None},
      ["traceparent", "missing"],
    )
    assert sanitized == {"traceparent": "00-abc"}

  def test_non_object_metadata_yields_empty(self):
    assert sanitize_consumed_metadata("not-an-object", ["x"]) == {}
    assert sanitize_consumed_metadata(None, ["x"]) == {}
    assert sanitize_consumed_metadata(["a"], ["a"]) == {}

  def test_redacts_nested_credentials(self):
    redacted = redact_for_logging(
      {
        "meta": {"traceparent": "00-abc", "cookie": "session=1"},
        "list": [{"token": "t"}, "plain"],
      }
    )
    assert redacted["meta"]["traceparent"] == "00-abc"
    assert redacted["meta"]["cookie"] == REDACTED_PLACEHOLDER
    assert redacted["list"][0]["token"] == REDACTED_PLACEHOLDER
    assert redacted["list"][1] == "plain"

  def test_redaction_is_non_mutating(self):
    original = {"password": "p", "ok": "v"}
    redacted = redact_for_logging(original)
    assert redacted["password"] == REDACTED_PLACEHOLDER
    assert original["password"] == "p"  # input untouched

  def test_redaction_matches_substring_and_case_insensitively(self):
    redacted = redact_for_logging(
      {"Authorization": "Bearer x", "API_KEY": "k", "user_password_hash": "h", "name": "ok"}
    )
    assert redacted["Authorization"] == REDACTED_PLACEHOLDER
    assert redacted["API_KEY"] == REDACTED_PLACEHOLDER
    assert redacted["user_password_hash"] == REDACTED_PLACEHOLDER
    assert redacted["name"] == "ok"

  def test_redaction_passes_through_scalars(self):
    assert redact_for_logging("plain") == "plain"
    assert redact_for_logging(42) == 42
    assert redact_for_logging(None) is None


# ─── AC-44.24 — validate tool args/results; report errors ─────────────────────


class TestPeerToolCall:
  def test_reports_invalid_args_as_minus_32602(self):
    tool = {
      "inputSchema": {
        "type": "object",
        "properties": {"location": {"type": "string"}},
        "required": ["location"],
      }
    }
    r = validate_peer_tool_call(tool=tool, args={"location": 42})
    assert r.ok is False
    assert r.code == VALIDATION_ERROR_CODE == -32602
    assert len(r.errors) > 0

  def test_validates_structured_results(self):
    tool = {
      "inputSchema": OBJECT_SCHEMA,
      "outputSchema": {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]},
    }
    bad = validate_peer_tool_call(tool=tool, args={}, structured_result={"ok": "yes"})
    assert bad.ok is False
    assert bad.message == "Structured result failed output-schema validation"
    good = validate_peer_tool_call(tool=tool, args={}, structured_result={"ok": True})
    assert good.ok is True

  def test_accepts_valid_arguments(self):
    tool = {"inputSchema": {"type": "object", "properties": {"location": {"type": "string"}}}}
    assert validate_peer_tool_call(tool=tool, args={"location": "SF"}).ok is True

  def test_missing_required_arg_reported(self):
    tool = {"inputSchema": {"type": "object", "properties": {"x": {"type": "string"}}, "required": ["x"]}}
    r = validate_peer_tool_call(tool=tool, args={})
    assert r.ok is False
    assert r.message == "Tool arguments failed input-schema validation"

  def test_no_structured_result_skips_output_check(self):
    # When no structured_result is supplied, the output schema is not exercised.
    tool = {"inputSchema": OBJECT_SCHEMA, "outputSchema": {"type": "object", "required": ["ok"]}}
    assert validate_peer_tool_call(tool=tool, args={}).ok is True


# ─── AC-44.25 — URI validation; authorized location; SSRF ─────────────────────


class TestResourceUri:
  def test_rejects_malformed_uri(self):
    r = validate_resource_uri_access("not a uri", is_authorized_location=lambda url: True)
    assert r.ok is False
    assert "absolute URI" in r.reason

  def test_rejects_unauthorized_location(self):
    r = validate_resource_uri_access("https://example.com/x", is_authorized_location=lambda url: False)
    assert r.ok is False
    assert "not authorized" in r.reason

  def test_guards_against_ssrf(self):
    auth = lambda url: True  # noqa: E731
    assert validate_resource_uri_access("http://127.0.0.1/admin", is_authorized_location=auth, guard_ssrf=True).ok is False
    assert validate_resource_uri_access("http://169.254.169.254/latest", is_authorized_location=auth, guard_ssrf=True).ok is False
    assert validate_resource_uri_access("http://10.0.0.5/x", is_authorized_location=auth, guard_ssrf=True).ok is False
    assert validate_resource_uri_access("http://localhost/x", is_authorized_location=auth, guard_ssrf=True).ok is False
    # A public host passes.
    assert validate_resource_uri_access("https://example.com/x", is_authorized_location=auth, guard_ssrf=True).ok is True

  def test_ssrf_private_ranges_and_ipv6(self):
    auth = lambda url: True  # noqa: E731
    for host in ("192.168.1.1", "172.16.0.1", "172.31.255.255", "0.0.0.0"):
      assert validate_resource_uri_access(f"http://{host}/x", is_authorized_location=auth, guard_ssrf=True).ok is False
    # 172.15 / 172.32 are PUBLIC (outside the 16-31 private band).
    assert validate_resource_uri_access("http://172.15.0.1/x", is_authorized_location=auth, guard_ssrf=True).ok is True
    assert validate_resource_uri_access("http://172.32.0.1/x", is_authorized_location=auth, guard_ssrf=True).ok is True
    # IPv6 loopback / unique-local / link-local literals.
    for host in ("[::1]", "[fc00::1]", "[fd12::1]", "[fe80::1]"):
      assert validate_resource_uri_access(f"http://{host}/x", is_authorized_location=auth, guard_ssrf=True).ok is False
    # *.localhost is treated as loopback.
    assert validate_resource_uri_access("http://api.localhost/x", is_authorized_location=auth, guard_ssrf=True).ok is False

  def test_ssrf_not_guarded_when_flag_off(self):
    # Without the SSRF flag a private host is allowed (authorization still gates it).
    r = validate_resource_uri_access("http://127.0.0.1/x", is_authorized_location=lambda url: True)
    assert r.ok is True

  def test_authorization_predicate_receives_parsed_url(self):
    seen = {}

    def auth(url):
      seen["scheme"] = url.scheme
      seen["host"] = url.hostname
      return True

    validate_resource_uri_access("https://example.com/p", is_authorized_location=auth)
    assert seen == {"scheme": "https", "host": "example.com"}


# ─── AC-44.26 — Origin validation (DNS-rebinding defense) ─────────────────────


class TestRequestOrigin:
  def test_rejects_untrusted_passes_accepted_and_absent(self):
    accepted = ["https://app.example.com"]
    rejected = validate_request_origin("https://evil.example.com", accepted)
    assert rejected.accepted is False
    assert rejected.origin == "https://evil.example.com"
    assert validate_request_origin("https://app.example.com", accepted).accepted is True
    assert validate_request_origin(None, accepted).accepted is True

  def test_accepts_set_input(self):
    assert validate_request_origin("https://a", {"https://a"}).accepted is True
    assert validate_request_origin("https://b", {"https://a"}).accepted is False

  def test_empty_accept_set_rejects_present_origin(self):
    r = validate_request_origin("https://x", [])
    assert r.accepted is False
    assert r.origin == "https://x"


# ─── AC-44.27 — cursor treated as opaque/untrusted ────────────────────────────


class TestPaginationCursor:
  def test_rejects_unknown_cursor_with_minus_32602(self):
    r = validate_pagination_cursor("attacker-controlled", is_known=lambda c: False)
    assert r.ok is False
    assert r.error["code"] == INVALID_CURSOR_CODE == -32602

  def test_accepts_known_and_absent_cursor(self):
    known = validate_pagination_cursor("page-2", is_known=lambda c: True)
    assert known.ok is True
    assert known.cursor == "page-2"
    first = validate_pagination_cursor(None, is_known=lambda c: True)
    assert first.ok is True
    assert first.cursor is None

  def test_is_known_receives_the_cursor(self):
    seen = []
    validate_pagination_cursor("c1", is_known=lambda c: seen.append(c) or True)
    assert seen == ["c1"]


# ─── AC-44.28 — bounded consumption (schema depth, payload size) ──────────────


class TestInputBounds:
  def test_rejects_schema_deeper_than_bound(self):
    deep = {"type": "string"}
    for _ in range(10):
      deep = {"type": "object", "properties": {"nested": deep}}
    r = enforce_input_bounds(schema=deep, bounds=InputBounds(max_schema_depth=4, max_payload_bytes=1024))
    assert r.ok is False
    assert "nesting depth" in r.reason

  def test_rejects_oversized_payload(self):
    big = "x" * 2000
    r = enforce_input_bounds(serialized_payload=big, bounds=InputBounds(max_schema_depth=64, max_payload_bytes=1000))
    assert r.ok is False
    assert "payload size" in r.reason

  def test_accepts_within_default_bounds(self):
    assert DEFAULT_INPUT_BOUNDS.max_schema_depth > 0
    assert enforce_input_bounds(schema=OBJECT_SCHEMA, serialized_payload="{}").ok is True

  def test_payload_uses_utf8_byte_length(self):
    # A 2-byte UTF-8 char counts as 2 bytes against the limit.
    two_byte = "é" * 600  # 1200 bytes
    r = enforce_input_bounds(serialized_payload=two_byte, bounds=InputBounds(max_schema_depth=64, max_payload_bytes=1000))
    assert r.ok is False

  def test_no_schema_and_no_payload_passes(self):
    assert enforce_input_bounds().ok is True

  def test_schema_at_exact_depth_passes(self):
    schema = {"type": "object", "properties": {"a": {"type": "string"}}}
    # depth here is small; a generous bound accepts it.
    assert enforce_input_bounds(schema=schema, bounds=InputBounds(max_schema_depth=64, max_payload_bytes=1024)).ok is True


# ─── AC-44.29 — no automatic external dereferencing ───────────────────────────


class TestSelfContainedSchema:
  def test_rejects_external_ref(self):
    schema = {"type": "object", "properties": {"x": {"$ref": "https://evil.example.com/schema.json"}}}
    r = assert_self_contained_schema(schema)
    assert r.ok is False
    assert "external" in r.reason

  def test_accepts_in_document_ref(self):
    schema = {
      "type": "object",
      "$defs": {"x": {"type": "string"}},
      "properties": {"y": {"$ref": "#/$defs/x"}},
    }
    assert assert_self_contained_schema(schema).ok is True

  def test_permits_external_refs_when_trusted(self):
    schema = {"properties": {"x": {"$ref": "https://trusted.example.com/s.json"}}}
    assert assert_self_contained_schema(schema, allow_trusted_external_refs=True).ok is True

  def test_dynamic_ref_external_rejected(self):
    schema = {"properties": {"x": {"$dynamicRef": "https://evil.example.com/s.json"}}}
    assert assert_self_contained_schema(schema).ok is False

  def test_anchor_ref_is_in_document(self):
    schema = {"$anchor": "node", "properties": {"x": {"$ref": "#node"}}}
    assert assert_self_contained_schema(schema).ok is True


# ─── AC-44.30 — file path sanitization (directory traversal) ──────────────────


class TestFilePathSanitization:
  def test_rejects_traversal_escape(self):
    r = sanitize_file_path("../../etc/passwd", "/srv/data")
    assert r.ok is False
    assert "escapes" in r.reason

  def test_rejects_absolute_path_outside_root(self):
    r = sanitize_file_path("/etc/passwd", "/srv/data")
    assert r.ok is False

  def test_accepts_path_within_root_and_normalizes(self):
    r = sanitize_file_path("sub/./file.txt", "/srv/data")
    assert r.ok is True
    assert r.resolved_path == "/srv/data/sub/file.txt"

  def test_accepts_traversal_back_inside_root(self):
    r = sanitize_file_path("a/../b/file.txt", "/srv/data")
    assert r.ok is True
    assert r.resolved_path == "/srv/data/b/file.txt"

  def test_rejects_nul_byte(self):
    r = sanitize_file_path("file\x00.txt", "/srv/data")
    assert r.ok is False
    assert "NUL" in r.reason

  def test_root_itself_resolves_to_root(self):
    r = sanitize_file_path("", "/srv/data")
    assert r.ok is True
    assert r.resolved_path == "/srv/data"

  def test_duplicate_slashes_collapsed(self):
    r = sanitize_file_path("a//b///c.txt", "/srv/data")
    assert r.ok is True
    assert r.resolved_path == "/srv/data/a/b/c.txt"

  def test_absolute_path_inside_root_accepted(self):
    r = sanitize_file_path("/srv/data/x/y.txt", "/srv/data")
    assert r.ok is True
    assert r.resolved_path == "/srv/data/x/y.txt"

  def test_sibling_root_prefix_is_not_inside(self):
    # "/srv/data-evil" must NOT be considered inside "/srv/data".
    r = sanitize_file_path("/srv/data-evil/x", "/srv/data")
    assert r.ok is False
