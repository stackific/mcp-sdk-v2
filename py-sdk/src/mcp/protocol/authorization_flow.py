"""S36 — Authorization II: the OAuth 2.1 authorization-code-with-PKCE flow, token
exchange, refresh, audience binding & worked examples (§23.4–§23.10).

S35 (:mod:`mcp.protocol.authorization`) established *where* the protected-resource and
authorization-server metadata live; this module turns that discovered metadata into an
actual access token and uses it. It provides the executable heart of MCP authorization:

  - ``client_id`` acquisition — the three mechanisms (pre-registration, Client ID Metadata
    Documents, Dynamic Client Registration) plus the user-prompt fallback and the SHOULD
    priority order (R-23.4-a – R-23.4-c);
  - Client ID Metadata Documents — schema, the ``client_id == URL`` identity rule, the
    HTTPS/path-component constraints, and the authorization-server-side fetch/validate/cache
    duties (R-23.4-d – R-23.4-l);
  - Dynamic Client Registration (Deprecated) — the ``application_type`` requirement,
    registration-failure handling, retry, and per-``issuer`` credential binding with
    re-registration (R-23.4-m – R-23.4-t);
  - PKCE — high-entropy ``code_verifier`` generation (43–128 unreserved chars) and the
    ``S256`` ``code_challenge = BASE64URL(SHA-256(verifier))`` derivation, with injectable
    randomness for deterministic tests (R-23.5-a, R-23.5-b);
  - the per-request record that captures the recorded ``issuer``, ``state``, and
    ``code_verifier`` for later redirect validation (R-23.5-c);
  - the authorization request and its URL builder, with the scope-priority rule
    (R-23.5-d – R-23.5-j);
  - the redirect handler — ``state`` verification and ``iss`` validation per the §23.7
    decision table, by exact string match with no normalization (R-23.5-h, R-23.5-k –
    R-23.5-m, R-23.7-a – R-23.7-h);
  - the token request (authorization_code & refresh_token grants) and the token response
    schema/validator, with ``resource`` audience binding in both legs (R-23.5-n – R-23.5-p,
    R-23.6-a – R-23.6-i, R-23.9-a – R-23.9-g);
  - bearer-token usage — the ``Authorization: Bearer …`` header on every request, no token
    in the query string, and the server-side per-request validation that yields
    ``401``/``403`` (R-23.8-a – R-23.8-f).

Mirrors the TS SDK's ``protocol/authorization-flow.ts``. Validation uses ``jsonschema``;
randomness is modelled as a callable ``(size: int) -> bytes`` defaulting to
:func:`secrets.token_bytes`. Builds on S35's ``ProtectedResourceMetadata*``,
``AuthorizationServerMetadata*``, ``WwwAuthenticate*``, ``challenged_scopes``,
``resource_identifiers_equal``, and ``CredentialStore`` symbols, none of which are
redefined here.
"""

from __future__ import annotations

import base64
import hashlib
import re
import secrets
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from jsonschema import Draft202012Validator

from mcp.protocol.authorization import (
  BEARER_AUTH_SCHEME,
  WwwAuthenticateChallenge,
  build_insufficient_scope_response,
  build_unauthorized_response,
  challenged_scopes,
  resource_identifiers_equal,
)

#: A byte source: ``(size) -> bytes`` of exactly ``size`` bytes.
RandomSource = Callable[[int], bytes]

# ─── OAuth fixed token values (§23.5) ────────────────────────────────────────────

#: The only permitted authorization-request ``response_type``. (R-23.5-d)
RESPONSE_TYPE_CODE = "code"
#: The only permitted PKCE ``code_challenge_method``. (R-23.5-a, R-23.5-i)
CODE_CHALLENGE_METHOD_S256 = "S256"
#: The token-request ``grant_type`` for the initial authorization-code exchange. (R-23.5-n)
GRANT_TYPE_AUTHORIZATION_CODE = "authorization_code"
#: The token-request ``grant_type`` for a refresh exchange. (R-23.9-e)
GRANT_TYPE_REFRESH_TOKEN = "refresh_token"
#: The ``token_type`` every MCP access token carries. (R-23.8-b)
TOKEN_TYPE_BEARER = "Bearer"
#: The HTTP ``Authorization`` request-header name. (R-23.8-b)
AUTHORIZATION_HEADER = "Authorization"
#: The reserved scope a client adds to request a refresh token, when (and only when) the
#: authorization-server metadata advertises it. (R-23.9-b)
OFFLINE_ACCESS_SCOPE = "offline_access"

# ─── PKCE: code_verifier & code_challenge (§23.5, R-23.5-a, R-23.5-b) ────────────

#: The minimum ``code_verifier`` length mandated by RFC 7636. (R-23.5-b)
CODE_VERIFIER_MIN_LENGTH = 43
#: The maximum ``code_verifier`` length mandated by RFC 7636. (R-23.5-b)
CODE_VERIFIER_MAX_LENGTH = 128

#: The RFC 7636 ``code_verifier`` "unreserved" alphabet:
#: ``ALPHA / DIGIT / "-" / "." / "_" / "~"``. A verifier MUST consist solely of these
#: characters. (R-23.5-b)
PKCE_UNRESERVED_RE = re.compile(r"^[A-Za-z0-9\-._~]+$")


def _base64url_encode(buffer: bytes) -> str:
  """Encode ``buffer`` as unpadded BASE64URL, per RFC 4648 §5 (RFC 7636 uses this)."""
  return base64.urlsafe_b64encode(buffer).rstrip(b"=").decode("ascii")


@dataclass
class PkceChallenge:
  """A generated PKCE pair: the secret verifier and its derived public challenge."""

  #: The high-entropy secret; 43–128 unreserved chars. (R-23.5-b)
  code_verifier: str
  #: ``BASE64URL(SHA-256(code_verifier))``. (R-23.5-b)
  code_challenge: str
  #: Always ``S256`` for MCP. (R-23.5-a, R-23.5-i)
  code_challenge_method: str = CODE_CHALLENGE_METHOD_S256


def is_valid_code_verifier(verifier: str) -> bool:
  """Return ``True`` when ``verifier`` is a valid PKCE ``code_verifier``: 43–128 characters
  drawn solely from the unreserved alphabet. (R-23.5-b)
  """
  return (
    CODE_VERIFIER_MIN_LENGTH <= len(verifier) <= CODE_VERIFIER_MAX_LENGTH
    and PKCE_UNRESERVED_RE.match(verifier) is not None
  )


def generate_code_verifier(random_source: RandomSource = secrets.token_bytes) -> str:
  """Generate a high-entropy PKCE ``code_verifier``. (R-23.5-b)

  32 random bytes BASE64URL-encode to a 43-character string drawn entirely from the
  unreserved alphabet — the RFC 7636 minimum length and recommended entropy. Randomness is
  injectable (``random_source``) so callers can produce a deterministic verifier in tests;
  the default draws from :func:`secrets.token_bytes`'s CSPRNG.

  :raises ValueError: When an injected ``random_source`` yields a verifier outside the
    43–128 unreserved-char range.
  """
  verifier = _base64url_encode(random_source(32))
  if not is_valid_code_verifier(verifier):
    raise ValueError("generated code_verifier MUST be 43–128 unreserved characters (R-23.5-b)")
  return verifier


def derive_code_challenge(code_verifier: str) -> str:
  """Derive the ``S256`` ``code_challenge`` from a ``code_verifier``:
  ``BASE64URL(SHA-256(code_verifier))``. (R-23.5-b)

  :raises ValueError: When ``code_verifier`` is not a valid PKCE verifier.
  """
  if not is_valid_code_verifier(code_verifier):
    raise ValueError("code_verifier MUST be 43–128 unreserved characters (R-23.5-b)")
  return _base64url_encode(hashlib.sha256(code_verifier.encode("ascii")).digest())


def create_pkce_challenge(random_source: RandomSource = secrets.token_bytes) -> PkceChallenge:
  """Create a complete PKCE pair (verifier + ``S256`` challenge + method). (R-23.5-a,
  R-23.5-b)

  PKCE is REQUIRED for this flow and the method MUST be ``S256``; this is the single entry
  point that yields a ready-to-use pair. Randomness is injectable for deterministic tests.
  """
  code_verifier = generate_code_verifier(random_source)
  return PkceChallenge(
    code_verifier=code_verifier,
    code_challenge=derive_code_challenge(code_verifier),
    code_challenge_method=CODE_CHALLENGE_METHOD_S256,
  )


def verify_pkce(code_verifier: str, code_challenge: str) -> bool:
  """Verify that a presented ``code_verifier`` matches a previously issued ``code_challenge``
  under the ``S256`` method — the check an authorization server's token endpoint performs.
  (R-23.5-b)
  """
  return is_valid_code_verifier(code_verifier) and derive_code_challenge(code_verifier) == code_challenge


# ─── client_id acquisition mechanisms (§23.4, R-23.4-a – R-23.4-c) ───────────────

#: The ways a client obtains a ``client_id``, plus the user-prompt fallback. (R-23.4-a)
#:   - ``"pre-registration"`` — credentials provisioned out of band ahead of time.
#:   - ``"cimd"`` — a Client ID Metadata Document HTTPS URL used directly as ``client_id``.
#:   - ``"dcr"`` — Dynamic Client Registration (Deprecated) at a ``registration_endpoint``.
#:   - ``"prompt"`` — fall back to prompting the user.
ClientIdMechanism = str

#: The SHOULD priority order for selecting a ``client_id`` mechanism:
#: pre-registration → CIMD → DCR → user prompt. (R-23.4-b)
CLIENT_ID_MECHANISM_PRIORITY: tuple[str, ...] = ("pre-registration", "cimd", "dcr", "prompt")


def select_client_id_mechanism(supported) -> ClientIdMechanism:
  """Select the ``client_id`` mechanism to use from those a client supports, applying the
  priority order pre-registration → CIMD → DCR → user prompt. (R-23.4-a, R-23.4-b)

  Returns the highest-priority supported mechanism. When ``supported`` is empty the client
  falls back to prompting the user, so ``"prompt"`` is returned.
  """
  supported_set = set(supported)
  for mechanism in CLIENT_ID_MECHANISM_PRIORITY:
    if mechanism in supported_set:
      return mechanism
  return "prompt"


@dataclass(frozen=True)
class PreRegistrationCheck:
  """Outcome of :func:`check_pre_registered_credentials`."""

  ok: bool
  reason: str | None = None


def check_pre_registered_credentials(
  credential_issuer: str, metadata_issuer: str
) -> PreRegistrationCheck:
  """Verify that pre-registered credentials' authorization server matches the one indicated
  by protected-resource metadata, surfacing an error on mismatch rather than silently using
  mismatched credentials. (R-23.4-c)

  Compares the two ``issuer`` values by exact string match. On mismatch the caller SHOULD
  surface the returned reason and MUST NOT use the credentials.
  """
  if credential_issuer != metadata_issuer:
    return PreRegistrationCheck(
      ok=False,
      reason=(
        f'pre-registered credentials belong to authorization server "{credential_issuer}", '
        f'but protected-resource metadata indicates "{metadata_issuer}"; surface an error '
        f"rather than using mismatched credentials (R-23.4-c)"
      ),
    )
  return PreRegistrationCheck(ok=True)


# ─── Client ID Metadata Documents (§23.4, R-23.4-d – R-23.4-l) ───────────────────

#: JSON Schema for a Client ID Metadata Document (CIMD): a JSON document hosted at an HTTPS
#: URL that *is* the client's ``client_id``. (§23.4, R-23.4-f, R-23.4-g)
#:
#: ``client_id``, ``client_name``, and ``redirect_uris`` are REQUIRED (R-23.4-f);
#: ``client_id`` MUST exactly equal the document's own URL (R-23.4-g, enforced at validation
#: time by :func:`validate_client_id_metadata_document`). Additional client-metadata fields
#: are preserved.
CLIENT_ID_METADATA_DOCUMENT_SCHEMA = {
  "type": "object",
  "properties": {
    "client_id": {"type": "string", "minLength": 1},
    "client_name": {"type": "string", "minLength": 1},
    "redirect_uris": {"type": "array", "items": {"type": "string"}, "minItems": 1},
    "client_uri": {"type": "string"},
    "logo_uri": {"type": "string"},
    "grant_types": {"type": "array", "items": {"type": "string"}},
    "response_types": {"type": "array", "items": {"type": "string"}},
    "token_endpoint_auth_method": {"type": "string"},
  },
  "required": ["client_id", "client_name", "redirect_uris"],
  "additionalProperties": True,
}

_CLIENT_ID_METADATA_DOCUMENT_VALIDATOR = Draft202012Validator(CLIENT_ID_METADATA_DOCUMENT_SCHEMA)


def is_client_id_metadata_document(value: object) -> bool:
  """Return ``True`` when ``value`` is a structurally valid CIMD document. (R-23.4-f)"""
  return _CLIENT_ID_METADATA_DOCUMENT_VALIDATOR.is_valid(value)


def is_valid_cimd_client_id_url(client_id: str) -> bool:
  """Return ``True`` when ``client_id`` is a syntactically valid CIMD ``client_id`` URL: an
  absolute ``https`` URL that contains a (non-root) path component. (R-23.4-e)

  A bare-origin URL like ``https://app.example.com`` (path ``/``) is rejected — the spec
  requires a path component identifying the metadata document.
  """
  parts = urlsplit(client_id)
  if parts.scheme != "https" or parts.netloc == "" or parts.hostname is None:
    return False
  return parts.path not in ("", "/")


@dataclass(frozen=True)
class ClientIdMetadataDocumentValidation:
  """Outcome of :func:`validate_client_id_metadata_document`."""

  ok: bool
  document: dict | None = None
  reason: str | None = None


def validate_client_id_metadata_document(
  document_url: str, value: object, presented_redirect_uri: str | None = None
) -> ClientIdMetadataDocumentValidation:
  """Validate a fetched CIMD document against the URL it was fetched from — the
  fetch/validate duties an authorization server performs on encountering a URL-formatted
  ``client_id``. (R-23.4-i, R-23.4-j, R-23.4-k)

  Checks, in order:
    - the ``client_id`` URL is a valid HTTPS URL with a path component (R-23.4-e);
    - the body is valid JSON containing the REQUIRED fields (R-23.4-k);
    - the document's ``client_id`` exactly equals the fetch URL (R-23.4-i);
    - when a ``presented_redirect_uri`` is supplied, it appears in the document's
      ``redirect_uris`` (R-23.4-j).
  """
  if not is_valid_cimd_client_id_url(document_url):
    return ClientIdMetadataDocumentValidation(
      ok=False,
      reason=f'CIMD client_id "{document_url}" MUST be an https URL with a path component (R-23.4-e)',
    )
  errors = sorted(
    _CLIENT_ID_METADATA_DOCUMENT_VALIDATOR.iter_errors(value), key=lambda e: list(e.path)
  )
  if errors:
    return ClientIdMetadataDocumentValidation(
      ok=False,
      reason=(
        f"CIMD document MUST be valid JSON with client_id, client_name, redirect_uris "
        f"(R-23.4-k): {errors[0].message}"
      ),
    )
  if value["client_id"] != document_url:
    return ClientIdMetadataDocumentValidation(
      ok=False,
      reason=(
        f'CIMD client_id "{value["client_id"]}" MUST exactly equal the document URL '
        f'"{document_url}" (R-23.4-g, R-23.4-i)'
      ),
    )
  if presented_redirect_uri is not None and presented_redirect_uri not in value["redirect_uris"]:
    return ClientIdMetadataDocumentValidation(
      ok=False,
      reason=(
        f'presented redirect_uri "{presented_redirect_uri}" is not listed in the CIMD '
        f"document's redirect_uris (R-23.4-j)"
      ),
    )
  return ClientIdMetadataDocumentValidation(ok=True, document=dict(value))


# ─── Dynamic Client Registration (Deprecated) (§23.4, R-23.4-m – R-23.4-t) ───────

#: The DCR ``application_type``: ``"native"`` (desktop/mobile/CLI/localhost; R-23.4-n) or
#: ``"web"`` (remote browser-based, non-local host; R-23.4-o).
ApplicationType = str


def application_type_for(is_native: bool) -> ApplicationType:
  """Return the ``application_type`` a client SHOULD register based on whether it runs as a
  native (desktop/mobile/CLI/localhost) or a remote browser-based app. (R-23.4-n, R-23.4-o)
  """
  return "native" if is_native else "web"


#: JSON Schema for a Dynamic Client Registration request body (Deprecated). (§23.4, R-23.4-m)
#:
#: ``redirect_uris`` and ``application_type`` are REQUIRED per MCP (R-23.4-m); omitting
#: ``application_type`` would default to ``web`` under OIDC, which MCP does not permit, so
#: the schema requires it explicitly. Additional RFC 7591 fields are preserved.
DYNAMIC_CLIENT_REGISTRATION_REQUEST_SCHEMA = {
  "type": "object",
  "properties": {
    "redirect_uris": {"type": "array", "items": {"type": "string"}, "minItems": 1},
    "application_type": {"enum": ["native", "web"]},
    "client_name": {"type": "string"},
    "grant_types": {"type": "array", "items": {"type": "string"}},
    "response_types": {"type": "array", "items": {"type": "string"}},
    "token_endpoint_auth_method": {"type": "string"},
    "scope": {"type": "string"},
  },
  "required": ["redirect_uris", "application_type"],
  "additionalProperties": True,
}

_DYNAMIC_CLIENT_REGISTRATION_REQUEST_VALIDATOR = Draft202012Validator(
  DYNAMIC_CLIENT_REGISTRATION_REQUEST_SCHEMA
)


def is_dynamic_client_registration_request(value: object) -> bool:
  """Return ``True`` when ``value`` is a structurally valid DCR request body. (R-23.4-m)"""
  return _DYNAMIC_CLIENT_REGISTRATION_REQUEST_VALIDATOR.is_valid(value)


def build_dynamic_client_registration_request(
  *,
  redirect_uris: list[str],
  application_type: ApplicationType,
  client_name: str | None = None,
  grant_types: list[str] | None = None,
  response_types: list[str] | None = None,
  token_endpoint_auth_method: str | None = None,
  scope: str | None = None,
) -> dict:
  """Build a Dynamic Client Registration request body, always including the REQUIRED
  ``application_type``. (R-23.4-m)

  .. deprecated::
     Dynamic Client Registration is Deprecated (§27.3). Use static OAuth 2.0 client
     registration instead. Earliest removal: 2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
  """
  body: dict = {"redirect_uris": list(redirect_uris), "application_type": application_type}
  if client_name is not None:
    body["client_name"] = client_name
  if grant_types is not None:
    body["grant_types"] = list(grant_types)
  if response_types is not None:
    body["response_types"] = list(response_types)
  if token_endpoint_auth_method is not None:
    body["token_endpoint_auth_method"] = token_endpoint_auth_method
  if scope is not None:
    body["scope"] = scope
  return body


#: JSON Schema for a Dynamic Client Registration response body (Deprecated). (§23.4)
#:
#: ``client_id`` is REQUIRED; ``client_secret`` is issued only for confidential clients.
#: Additional RFC 7591 fields are preserved.
DYNAMIC_CLIENT_REGISTRATION_RESPONSE_SCHEMA = {
  "type": "object",
  "properties": {
    "client_id": {"type": "string", "minLength": 1},
    "client_secret": {"type": "string"},
  },
  "required": ["client_id"],
  "additionalProperties": True,
}

_DYNAMIC_CLIENT_REGISTRATION_RESPONSE_VALIDATOR = Draft202012Validator(
  DYNAMIC_CLIENT_REGISTRATION_RESPONSE_SCHEMA
)


def is_dynamic_client_registration_response(value: object) -> bool:
  """Return ``True`` when ``value`` is a structurally valid DCR response body."""
  return _DYNAMIC_CLIENT_REGISTRATION_RESPONSE_VALIDATOR.is_valid(value)


@dataclass(frozen=True)
class DynamicClientRegistrationResult:
  """The outcome of a DCR registration attempt, modelling the failure cases a client MUST
  be prepared to handle. (R-23.4-p, R-23.4-q, R-23.4-r)
  """

  ok: bool
  response: dict | None = None
  reason: str | None = None
  retryable: bool = False


def handle_dynamic_client_registration_response(
  status: int, body: object
) -> DynamicClientRegistrationResult:
  """Handle a DCR registration response, surfacing a meaningful error on failure and
  flagging whether a retry (with adjusted ``application_type`` or conforming redirect URIs)
  may help. (R-23.4-p, R-23.4-q, R-23.4-r)

    - A success body (valid JSON with a ``client_id``) → ``ok=True``.
    - An HTTP failure status, or a body lacking ``client_id``, → ``ok=False`` with a
      human-readable ``reason``; the client surfaces it (R-23.4-q) rather than crashing
      (R-23.4-p). ``retryable`` is ``True`` for redirect-URI/application-type rejections
      the client MAY retry (R-23.4-r).
  """
  if 200 <= status < 300:
    if is_dynamic_client_registration_response(body):
      return DynamicClientRegistrationResult(ok=True, response=dict(body))
    return DynamicClientRegistrationResult(
      ok=False,
      reason=f"DCR succeeded with HTTP {status} but the body lacks a valid client_id (R-23.4-q)",
      retryable=False,
    )
  # Surface an error meaningfully rather than crashing (R-23.4-p, R-23.4-q). A 400 typically
  # signals a redirect-URI / application-type constraint the client MAY retry (R-23.4-r).
  if isinstance(body, dict) and "error_description" in body:
    description = str(body["error_description"])
  else:
    description = f"registration failed with HTTP {status}"
  return DynamicClientRegistrationResult(
    ok=False, reason=f"DCR registration rejected: {description} (R-23.4-q)", retryable=status == 400
  )


@dataclass
class DynamicClientRegistrationCredential:
  """Persisted DCR credentials, bound to the issuing authorization server's ``issuer``.
  (R-23.4-s)
  """

  #: The issuing authorization server's ``issuer``; the binding key. (R-23.4-s)
  issuer: str
  #: The issued ``client_id``.
  client_id: str
  #: OPTIONAL issued secret for confidential clients.
  client_secret: str | None = None


class DynamicClientRegistrationStore:
  """A store for persisted DCR credentials, each keyed by the issuing authorization server's
  ``issuer``, that re-registers when the authorization server changes. (R-23.4-s, R-23.4-t)

  Separate from S35's :class:`~mcp.protocol.authorization.CredentialStore`, which holds
  runtime per-issuer access/refresh tokens; this store holds the persisted registration
  identity (``client_id``/``client_secret``) the DCR rules govern.
  """

  def __init__(self) -> None:
    self._by_issuer: dict[str, DynamicClientRegistrationCredential] = {}

  def save(self, credential: DynamicClientRegistrationCredential) -> None:
    """Persist ``credential``, keyed by its ``issuer``. Each authorization server keeps an
    isolated entry. (R-23.4-s)
    """
    self._by_issuer[credential.issuer] = DynamicClientRegistrationCredential(
      issuer=credential.issuer,
      client_id=credential.client_id,
      client_secret=credential.client_secret,
    )

  def credential_for(self, issuer: str) -> DynamicClientRegistrationCredential | None:
    """Return the persisted credential for ``issuer``, or ``None``. (R-23.4-s)"""
    found = self._by_issuer.get(issuer)
    if found is None:
      return None
    return DynamicClientRegistrationCredential(
      issuer=found.issuer, client_id=found.client_id, client_secret=found.client_secret
    )

  def needs_registration(self, issuer: str) -> bool:
    """Return ``True`` when the client must (re-)register against ``issuer`` — i.e. no
    credential is yet persisted for that authorization server. A client MUST re-register
    when the authorization server changes, which manifests as the new ``issuer`` having no
    persisted credential. (R-23.4-t)
    """
    return issuer not in self._by_issuer


# ─── Per-request authorization record — Step 1 (§23.5, R-23.5-c) ─────────────────

@dataclass
class AuthorizationFlowRecord:
  """Client-side bookkeeping captured in Step 1, associated with the ``code_verifier`` (and
  ``state``, if used), to validate the redirect later. (§23.5, R-23.5-c)
  """

  #: The high-entropy PKCE verifier this record is keyed to. (R-23.5-c)
  code_verifier: str
  #: The ``issuer`` from the selected authorization server's validated metadata, recorded
  #: BEFORE redirecting for later ``iss`` comparison. (R-23.5-c)
  recorded_issuer: str
  #: The ``code_challenge`` derived from ``code_verifier``. (R-23.5-b)
  code_challenge: str
  #: The opaque ``state`` sent, if any. (R-23.5-c, R-23.5-g)
  state: str | None = None
  #: The PKCE method; always ``S256``. (R-23.5-a)
  code_challenge_method: str = CODE_CHALLENGE_METHOD_S256


def generate_state(random_source: RandomSource = secrets.token_bytes) -> str:
  """Generate an opaque, unguessable ``state`` value binding an authorization request to the
  user-agent session. (R-23.5-g)

  32 random bytes BASE64URL-encoded. Randomness is injectable for tests.
  """
  return _base64url_encode(random_source(32))


# Sentinel distinguishing "no state argument supplied" (→ generate) from an explicit None.
_NO_STATE = object()


def create_authorization_flow_record(
  *,
  recorded_issuer: str,
  pkce: PkceChallenge | None = None,
  state=_NO_STATE,
  random_source: RandomSource = secrets.token_bytes,
) -> AuthorizationFlowRecord:
  """Build the Step-1 per-request record: a fresh PKCE pair (unless supplied), an opaque
  ``state`` (unless supplied), and the recorded ``issuer``. (R-23.5-a, R-23.5-b, R-23.5-c,
  R-23.5-g)

  The record MUST be created and the ``issuer`` recorded BEFORE the user agent is
  redirected, so the redirect's ``iss`` and ``state`` can be validated against it. Pass
  ``state=None`` explicitly to suppress state generation; omit ``state`` to generate one.
  """
  pkce_pair = pkce if pkce is not None else create_pkce_challenge(random_source)
  if state is _NO_STATE:
    resolved_state: str | None = generate_state(random_source)
  else:
    resolved_state = state
  return AuthorizationFlowRecord(
    code_verifier=pkce_pair.code_verifier,
    state=resolved_state,
    recorded_issuer=recorded_issuer,
    code_challenge=pkce_pair.code_challenge,
    code_challenge_method=pkce_pair.code_challenge_method,
  )


# ─── Scope priority (§23.5, R-23.5-f) ────────────────────────────────────────────

def resolve_authorization_scope(
  *,
  challenge: WwwAuthenticateChallenge | None = None,
  protected_resource: dict | None = None,
) -> str | None:
  """Resolve the ``scope`` parameter to send in the authorization request, applying the
  scope-priority rule. (R-23.5-f)

    1. If the ``WWW-Authenticate`` challenge carried a ``scope``, use that.
    2. Otherwise use all scopes in ``scopes_supported`` from protected-resource metadata.
    3. When neither is available, omit ``scope`` (returns ``None``).

  Callers MAY then add ``offline_access`` to request refresh capability when the
  authorization-server metadata advertises it (see :func:`with_offline_access_scope`).
  (R-23.9-b)
  """
  if challenge is not None:
    from_challenge = challenged_scopes(challenge)
    if len(from_challenge) > 0:
      return " ".join(from_challenge)
  supported = (protected_resource or {}).get("scopes_supported")
  if supported is not None and len(supported) > 0:
    return " ".join(supported)
  return None


def with_offline_access_scope(scope: str | None, authorization_server_meta: dict) -> str | None:
  """Add ``offline_access`` to a ``scope`` string when, and only when, the
  authorization-server metadata advertises it in ``scopes_supported``. (R-23.9-b)

  Returns the scope unchanged (possibly ``None``) when ``offline_access`` is not advertised,
  or already present. When ``scope`` is ``None`` but ``offline_access`` is advertised,
  returns just ``offline_access``.
  """
  advertised = OFFLINE_ACCESS_SCOPE in (authorization_server_meta.get("scopes_supported") or [])
  if not advertised:
    return scope
  parts = [] if scope is None else [s for s in re.split(r"\s+", scope) if len(s) > 0]
  if OFFLINE_ACCESS_SCOPE in parts:
    return scope
  parts.append(OFFLINE_ACCESS_SCOPE)
  return " ".join(parts)


def advertised_scopes_exclude_offline_access(
  *, challenge_scope: str | None = None, scopes_supported: list[str] | None = None
) -> bool:
  """Return ``True`` when neither the ``WWW-Authenticate`` ``scope`` nor protected-resource
  ``scopes_supported`` includes ``offline_access``, as an MCP server SHOULD ensure.
  (R-23.9-g)
  """
  challenge_has = challenge_scope is not None and OFFLINE_ACCESS_SCOPE in re.split(
    r"\s+", challenge_scope
  )
  metadata_has = OFFLINE_ACCESS_SCOPE in (scopes_supported or [])
  return not challenge_has and not metadata_has


# ─── Authorization request — Step 2 (§23.5, R-23.5-d – R-23.5-j) ─────────────────

@dataclass
class AuthorizationRequestParams:
  """The authorization-request query parameters directing the user agent to the
  ``authorization_endpoint``. (§23.5, R-23.5-d – R-23.5-j)

  Field names mirror the on-the-wire OAuth parameters. ``response_type``,
  ``code_challenge_method``, ``client_id``, ``redirect_uri``, ``code_challenge``, and
  ``resource`` are always present; ``scope`` and ``state`` are present when available.
  """

  #: The client identifier from registration.
  client_id: str
  #: MUST match one registered for the client. (R-23.5-e)
  redirect_uri: str
  #: ``BASE64URL(SHA-256(code_verifier))``. (R-23.5-b)
  code_challenge: str
  #: Canonical resource identifier of the target MCP server. (R-23.5-j, R-23.6-b)
  resource: str
  #: MUST be ``code``. (R-23.5-d)
  response_type: str = RESPONSE_TYPE_CODE
  #: MUST be ``S256``. (R-23.5-i)
  code_challenge_method: str = CODE_CHALLENGE_METHOD_S256
  #: Requested scopes; omitted when none determinable. (R-23.5-f)
  scope: str | None = None
  #: Opaque, unguessable session-binding value. (R-23.5-g)
  state: str | None = None


# ─── PKCE support confirmation — §28.5 (R-28.5-k) ───────────────────────────────

class PkceSupportError(Exception):
  """Raised when a client refuses to proceed because PKCE ``S256`` support cannot be
  confirmed from authorization-server metadata. (§28.5, R-28.5-k)
  """

  code = "PKCE_SUPPORT_UNCONFIRMED"

  def __init__(self, message: str) -> None:
    super().__init__(message)


@dataclass(frozen=True)
class PkceSupportCheck:
  """Outcome of :func:`confirm_pkce_support`."""

  ok: bool
  reason: str | None = None


def confirm_pkce_support(metadata: dict) -> PkceSupportCheck:
  """Confirm, from authorization-server metadata, that the AS supports PKCE with the
  ``S256`` challenge method. (§28.5, R-28.5-k)

  §28.5 requires a client to use PKCE ``S256`` where capable AND to verify via AS metadata
  that the server supports it before proceeding — refusing to proceed if support cannot be
  confirmed. Support is confirmable ONLY when ``code_challenge_methods_supported`` is
  present AND includes ``"S256"``; an absent field means support is unconfirmable (the
  client MUST refuse).
  """
  methods = metadata.get("code_challenge_methods_supported")
  if methods is None:
    return PkceSupportCheck(
      ok=False,
      reason=(
        "authorization-server metadata omits code_challenge_methods_supported; PKCE support "
        "cannot be confirmed (R-28.5-k)"
      ),
    )
  if CODE_CHALLENGE_METHOD_S256 not in methods:
    return PkceSupportCheck(
      ok=False,
      reason=(
        f'authorization-server metadata does not advertise PKCE "{CODE_CHALLENGE_METHOD_S256}" '
        f"support (R-28.5-k)"
      ),
    )
  return PkceSupportCheck(ok=True)


def is_pkce_support_confirmed(metadata: dict) -> bool:
  """Return ``True`` when AS metadata confirms PKCE ``S256`` support. (R-28.5-k)"""
  return confirm_pkce_support(metadata).ok


def assert_pkce_support_confirmed(metadata: dict) -> None:
  """Assert PKCE ``S256`` support is confirmable from AS metadata, raising
  :class:`PkceSupportError` when it is not — so the client refuses to proceed rather than
  starting an authorization flow against an AS that may not support PKCE. (§28.5, R-28.5-k)
  """
  result = confirm_pkce_support(metadata)
  if not result.ok:
    raise PkceSupportError(result.reason or "PKCE support unconfirmed")


def build_authorization_request(
  *,
  client_id: str,
  redirect_uri: str,
  resource: str,
  record: AuthorizationFlowRecord,
  scope: str | None = None,
  server_metadata: dict | None = None,
) -> AuthorizationRequestParams:
  """Build the authorization-request query parameters for Step 2, fixing
  ``response_type=code``, ``code_challenge_method=S256``, the ``code_challenge`` and
  ``state`` from the Step-1 record, and the REQUIRED ``resource`` parameter. (R-23.5-d,
  R-23.5-e, R-23.5-g, R-23.5-i, R-23.5-j, R-23.6-b)

  When ``server_metadata`` is supplied, the builder verifies PKCE ``S256`` support and
  refuses (raises :class:`PkceSupportError`) if it cannot be confirmed — enforcing §28.5
  (R-28.5-k). Callers that do not pass it MUST call :func:`assert_pkce_support_confirmed`
  themselves before proceeding.
  """
  if server_metadata is not None:
    assert_pkce_support_confirmed(server_metadata)
  params = AuthorizationRequestParams(
    client_id=client_id,
    redirect_uri=redirect_uri,
    code_challenge=record.code_challenge,
    resource=resource,
    response_type=RESPONSE_TYPE_CODE,
    code_challenge_method=CODE_CHALLENGE_METHOD_S256,
  )
  if scope is not None:
    params.scope = scope
  if record.state is not None:
    params.state = record.state
  return params


def build_authorization_url(
  authorization_endpoint: str, params: AuthorizationRequestParams
) -> str:
  """Serialize authorization-request parameters into a full authorization-endpoint URL with
  a percent-encoded query string. (§23.5, Step 2 wire example)

  Parameters are emitted in the spec's example order. Existing query parameters on
  ``authorization_endpoint`` are preserved.
  """
  parts = urlsplit(authorization_endpoint)
  existing = parse_qsl(parts.query, keep_blank_values=True)
  ordered: list[tuple[str, str | None]] = [
    ("response_type", params.response_type),
    ("client_id", params.client_id),
    ("redirect_uri", params.redirect_uri),
    ("scope", params.scope),
    ("state", params.state),
    ("code_challenge", params.code_challenge),
    ("code_challenge_method", params.code_challenge_method),
    ("resource", params.resource),
  ]
  # `URLSearchParams.set` replaces an existing key in place; emulate by keeping a dict of
  # the existing params, then overlaying the ordered ones (and preserving order).
  result: list[tuple[str, str]] = []
  set_keys = {key for key, value in ordered if value is not None}
  for key, value in existing:
    if key not in set_keys:
      result.append((key, value))
  for key, value in ordered:
    if value is not None:
      result.append((key, value))
  query = urlencode(result)
  return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


# ─── Authorization response & redirect handling — Step 3 (§23.5, §23.7) ──────────

@dataclass
class AuthorizationResponseParams:
  """The redirect query parameters the authorization server returns. (§23.5, §23.7)

  On success ``code`` is present; ``state`` echoes the request ``state``; ``iss``
  identifies the authorization server (SHOULD; R-23.5-k). On error, ``error`` and the
  optional ``error_description``/``error_uri`` are present and MUST NOT be acted on when
  ``iss`` validation fails (R-23.7-h).
  """

  #: The authorization code to redeem (success).
  code: str | None = None
  #: Echo of the request ``state`` (present if sent). (R-23.5-h)
  state: str | None = None
  #: The authorization server's issuer identifier (SHOULD). (R-23.5-k, R-23.7-b)
  iss: str | None = None
  #: Error code (error responses).
  error: str | None = None
  #: OPTIONAL human-readable error description.
  error_description: str | None = None
  #: OPTIONAL URI with error information.
  error_uri: str | None = None


def parse_authorization_response(redirect: str) -> AuthorizationResponseParams:
  """Parse an authorization-redirect URL (or raw query string) into its decoded parameters.
  (§23.5, Step 3 wire example)

  Percent-decoding is applied by the query parser; the decoded ``iss`` is then compared by
  EXACT string match with no further normalization (R-23.7-g) — this function performs no
  normalization beyond the form-decoding the wire requires.
  """
  parts = urlsplit(redirect)
  if parts.scheme != "" and parts.netloc != "":
    query = parts.query
  else:
    query = redirect[1:] if redirect.startswith("?") else redirect
  pairs = dict(parse_qsl(query, keep_blank_values=True))
  params = AuthorizationResponseParams()
  if "code" in pairs:
    params.code = pairs["code"]
  if "state" in pairs:
    params.state = pairs["state"]
  if "iss" in pairs:
    params.iss = pairs["iss"]
  if "error" in pairs:
    params.error = pairs["error"]
  if "error_description" in pairs:
    params.error_description = pairs["error_description"]
  if "error_uri" in pairs:
    params.error_uri = pairs["error_uri"]
  return params


#: The rows of the §23.7 issuer-validation decision table: ``"compare"`` | ``"reject"`` |
#: ``"proceed"``. (R-23.7-d)
IssuerValidationDecision = str


def issuer_validation_decision(
  iss_parameter_supported: bool | None, iss_present: bool
) -> IssuerValidationDecision:
  """Apply the §23.7 four-row decision table to determine how to treat the ``iss``
  parameter, given whether the authorization server advertises
  ``authorization_response_iss_parameter_supported`` and whether ``iss`` is present.
  (R-23.7-d, R-23.7-e, R-23.7-f)

  ===========  ============  ========
  supported    iss present   decision
  ===========  ============  ========
  true         yes           compare
  true         no            reject
  false        yes           compare
  false        no            proceed
  ===========  ============  ========

  A present ``iss`` is ALWAYS compared, regardless of advertisement (R-23.7-f).
  """
  if iss_present:
    return "compare"
  if iss_parameter_supported is True:
    return "reject"
  return "proceed"


@dataclass(frozen=True)
class IssuerValidationResult:
  """Outcome of :func:`validate_issuer`: whether the code may be redeemed."""

  ok: bool
  decision: str | None = None
  reason: str | None = None


def validate_issuer(
  *, iss: str | None = None, recorded_issuer: str, iss_parameter_supported: bool | None = None
) -> IssuerValidationResult:
  """Validate the authorization response's ``iss`` against the recorded issuer per §23.7,
  the check a client MUST perform BEFORE transmitting the authorization code to any token
  endpoint. (R-23.7-a, R-23.7-d, R-23.7-e, R-23.7-f, R-23.7-g)

  Applies :func:`issuer_validation_decision`; when the decision is ``compare``, the present
  ``iss`` is compared to ``recorded_issuer`` by EXACT string match — no scheme/host case
  folding, default-port elision, trailing-slash, or percent-encoding normalization is
  applied (R-23.7-g). A ``reject`` decision (the AS advertises ``iss`` support but the
  response omits it) fails (R-23.7-e). On any failure the caller MUST NOT redeem the code,
  and for error responses MUST NOT act on ``error``/``error_description``/``error_uri``
  (R-23.7-h, see :func:`safe_authorization_error`).
  """
  decision = issuer_validation_decision(iss_parameter_supported, iss is not None)
  if decision == "reject":
    return IssuerValidationResult(
      ok=False,
      reason=(
        "authorization_response_iss_parameter_supported is true but the response carried no "
        "iss; reject (R-23.7-e)"
      ),
    )
  if decision == "proceed":
    return IssuerValidationResult(ok=True, decision="proceed")
  # decision == "compare" — exact string match, no normalization (R-23.7-g).
  if iss != recorded_issuer:
    return IssuerValidationResult(
      ok=False,
      reason=(
        f'iss "{iss}" does not exactly match the recorded issuer "{recorded_issuer}" '
        f"(possible mix-up attack); MUST NOT redeem the code (R-23.7-a, R-23.7-g)"
      ),
    )
  return IssuerValidationResult(ok=True, decision="compare")


@dataclass(frozen=True)
class StateValidationResult:
  """Outcome of :func:`verify_redirect_state`."""

  ok: bool
  reason: str | None = None


def verify_redirect_state(
  sent_state: str | None, returned_state: str | None
) -> StateValidationResult:
  """Verify the redirect ``state`` against the value sent in Step 1, the check a client MUST
  pass before redeeming the code. (R-23.5-h, R-23.5-l)

  When a ``state`` was sent, the returned ``state`` MUST be present and equal it (exact
  string match). When no ``state`` was sent, a returned ``state`` is ignored.
  """
  if sent_state is None:
    return StateValidationResult(ok=True)
  if returned_state != sent_state:
    return StateValidationResult(
      ok=False,
      reason=(
        f'redirect state "{returned_state}" does not match the value sent "{sent_state}"; '
        f"MUST NOT redeem the code (R-23.5-l)"
      ),
    )
  return StateValidationResult(ok=True)


@dataclass(frozen=True)
class AuthorizationRedirectResult:
  """Outcome of :func:`process_authorization_redirect`."""

  ok: bool
  code: str | None = None
  reason: str | None = None
  #: ``{"error", "error_description", "error_uri"}`` — present only on an error response
  #: whose ``iss`` validated (else withheld per R-23.7-h).
  error: dict | None = None


def process_authorization_redirect(
  redirect: str, record, *, iss_parameter_supported: bool | None = None
) -> AuthorizationRedirectResult:
  """Process a Step-3 authorization redirect end to end: parse the response, verify
  ``state``, validate ``iss`` per §23.7, and only then yield the code for redemption.
  (§23.5 Step 3, R-23.5-h, R-23.5-l, R-23.5-m, R-23.7-a, R-23.7-h)

  Order of checks (all MUST pass before the code is redeemed):
    1. ``state`` matches the value sent (R-23.5-l);
    2. ``iss`` validates against the recorded issuer per §23.7 (R-23.5-m, R-23.7-a).

  On an error response, ``error``/``error_description``/``error_uri`` are returned in
  ``error`` ONLY when ``iss`` validation succeeds; on ``iss`` mismatch they are withheld and
  MUST NOT be acted on or displayed (R-23.7-h).

  ``record`` carries ``state`` and ``recorded_issuer`` (an :class:`AuthorizationFlowRecord`
  or any object/dict with those attributes/keys).
  """
  record_state, record_issuer = _record_state_and_issuer(record)
  params = parse_authorization_response(redirect)

  state_result = verify_redirect_state(record_state, params.state)
  if not state_result.ok:
    return AuthorizationRedirectResult(ok=False, reason=state_result.reason)

  iss_result = validate_issuer(
    iss=params.iss, recorded_issuer=record_issuer, iss_parameter_supported=iss_parameter_supported
  )
  if not iss_result.ok:
    # iss mismatch in an error response: do NOT surface error details. (R-23.7-h)
    return AuthorizationRedirectResult(ok=False, reason=iss_result.reason)

  if params.error is not None:
    # iss validated → it is now safe to surface the error details. (R-23.7-h)
    return AuthorizationRedirectResult(
      ok=False,
      reason=f'authorization server returned error "{params.error}"',
      error={
        "error": params.error,
        "error_description": params.error_description,
        "error_uri": params.error_uri,
      },
    )

  if params.code is None:
    return AuthorizationRedirectResult(
      ok=False, reason="authorization response is missing the code parameter"
    )
  return AuthorizationRedirectResult(ok=True, code=params.code)


def _record_state_and_issuer(record) -> tuple[str | None, str]:
  """Extract ``state`` and ``recorded_issuer`` from a record that may be an
  :class:`AuthorizationFlowRecord`, an arbitrary object with those attributes, or a dict.
  """
  if isinstance(record, dict):
    return record.get("state"), record["recorded_issuer"]
  return getattr(record, "state", None), record.recorded_issuer


def safe_authorization_error(
  params: AuthorizationResponseParams, iss_result: IssuerValidationResult
) -> dict | None:
  """Return the displayable error details from an authorization redirect ONLY when ``iss``
  validation succeeds, withholding them on mismatch. (R-23.7-h)

  A thin convenience over :func:`validate_issuer`: a client MUST NOT act on or display
  ``error``/``error_description``/``error_uri`` when the ``iss`` of an error response does
  not match the recorded issuer. Returns ``None`` when there is no error, or when the
  details must be withheld.
  """
  if params.error is None:
    return None
  if not iss_result.ok:
    return None
  return {
    "error": params.error,
    "error_description": params.error_description,
    "error_uri": params.error_uri,
  }


# ─── Token request — Step 4 & refresh (§23.5, §23.6, §23.9) ──────────────────────

def build_authorization_code_token_request(
  *, code: str, redirect_uri: str, code_verifier: str, client_id: str, resource: str
) -> dict:
  """Build the authorization-code token-request body (Step 4), fixing
  ``grant_type=authorization_code`` and carrying the PKCE ``code_verifier`` plus the
  REQUIRED ``resource`` parameter. (R-23.5-n, R-23.5-o, R-23.5-p, R-23.6-b)

  The ``redirect_uri`` and ``resource`` MUST be byte-identical to those sent in Step 2;
  callers SHOULD pass the same values — :func:`assert_resource_matches_step2` can verify the
  ``resource`` invariant. (R-23.5-o, R-23.5-p)
  """
  return {
    "grant_type": GRANT_TYPE_AUTHORIZATION_CODE,
    "code": code,
    "redirect_uri": redirect_uri,
    "code_verifier": code_verifier,
    "client_id": client_id,
    "resource": resource,
  }


def build_refresh_token_request(
  *, refresh_token: str, client_id: str, resource: str, scope: str | None = None
) -> dict:
  """Build the refresh-token token-request body, fixing ``grant_type=refresh_token`` and
  carrying the same ``resource`` parameter so the refreshed token stays audience-bound.
  (R-23.9-e, R-23.9-f)
  """
  body: dict = {
    "grant_type": GRANT_TYPE_REFRESH_TOKEN,
    "refresh_token": refresh_token,
    "client_id": client_id,
    "resource": resource,
  }
  if scope is not None:
    body["scope"] = scope
  return body


def encode_token_request_body(request: dict) -> str:
  """Serialize a token request into an ``application/x-www-form-urlencoded`` body.
  (§23.5/§23.9 wire examples)
  """
  pairs = [(key, str(value)) for key, value in request.items() if value is not None]
  return urlencode(pairs)


@dataclass(frozen=True)
class ResourceMatchResult:
  """Outcome of :func:`assert_resource_matches_step2`."""

  ok: bool
  reason: str | None = None


def assert_resource_matches_step2(request: dict, step2_resource: str) -> ResourceMatchResult:
  """Assert that a token request's ``resource`` is byte-identical to the value sent in
  Step 2, the audience-binding invariant. (R-23.5-p, R-23.9-e)
  """
  resource = request.get("resource")
  if resource != step2_resource:
    return ResourceMatchResult(
      ok=False,
      reason=(
        f'token request resource "{resource}" MUST be identical to the Step-2 resource '
        f'"{step2_resource}" (R-23.5-p)'
      ),
    )
  return ResourceMatchResult(ok=True)


# ─── Token response (§23.5, §23.9) ───────────────────────────────────────────────

#: JSON Schema for the token-endpoint JSON response. (§23.5 Step 4, §23.9)
#:
#: ``access_token`` and ``token_type`` (``Bearer``) are REQUIRED; ``expires_in``,
#: ``refresh_token``, and ``scope`` are OPTIONAL — a client MUST NOT assume a refresh token
#: will be issued (R-23.9-d). Additional RFC 6749 fields are preserved.
TOKEN_RESPONSE_SCHEMA = {
  "type": "object",
  "properties": {
    "access_token": {"type": "string", "minLength": 1},
    "token_type": {"type": "string", "minLength": 1},
    "expires_in": {"type": "integer"},
    "refresh_token": {"type": "string"},
    "scope": {"type": "string"},
  },
  "required": ["access_token", "token_type"],
  "additionalProperties": True,
}

_TOKEN_RESPONSE_VALIDATOR = Draft202012Validator(TOKEN_RESPONSE_SCHEMA)


def is_token_response(value: object) -> bool:
  """Return ``True`` when ``value`` is a structurally valid token response."""
  return _TOKEN_RESPONSE_VALIDATOR.is_valid(value)


@dataclass(frozen=True)
class TokenResponseValidation:
  """Outcome of :func:`parse_token_response`."""

  ok: bool
  token: dict | None = None
  reason: str | None = None


def parse_token_response(value: object) -> TokenResponseValidation:
  """Parse and validate a token-endpoint response body. (§23.5, R-23.8-b)

  Confirms the REQUIRED ``access_token``/``token_type`` are present and that ``token_type``
  is ``Bearer`` (case-insensitive, per RFC 6749) since MCP presents the token via the
  ``Bearer`` scheme (R-23.8-b). The presence of a ``refresh_token`` is left to the caller's
  discretion-aware handling — never assumed (R-23.9-d).
  """
  errors = sorted(_TOKEN_RESPONSE_VALIDATOR.iter_errors(value), key=lambda e: list(e.path))
  if errors:
    return TokenResponseValidation(ok=False, reason=f"invalid token response: {errors[0].message}")
  if value["token_type"].lower() != TOKEN_TYPE_BEARER.lower():
    return TokenResponseValidation(
      ok=False, reason=f'token_type "{value["token_type"]}" MUST be "Bearer" for MCP (R-23.8-b)'
    )
  return TokenResponseValidation(ok=True, token=dict(value))


def has_no_refresh_token(token: dict) -> bool:
  """Return ``True`` when a token response did NOT issue a refresh token, so callers never
  assume one was issued. (R-23.9-d)
  """
  return token.get("refresh_token") is None


# ─── Resource Indicators & audience binding (§23.6) ──────────────────────────────

def resource_parameter_for(canonical_resource_identifier: str) -> str:
  """Return the ``resource`` parameter value for the MCP server — its canonical resource
  identifier — that MUST be sent in BOTH the authorization and token requests, regardless of
  whether the authorization server advertises ``resource`` support. (R-23.6-b, R-23.6-c,
  R-23.6-d, R-23.6-e)

  This is the identity of the canonical resource identifier; it is surfaced as a named
  helper so call sites read intentionally and the "always send it" rule (R-23.6-e) is
  explicit. The value SHOULD already be a canonical resource identifier (validate with S35's
  ``is_valid_canonical_resource_identifier``).
  """
  return canonical_resource_identifier


@dataclass(frozen=True)
class TokenAudienceValidation:
  """Outcome of :func:`validate_token_audience`."""

  ok: bool
  reason: str | None = None


def validate_token_audience(
  token_audience, own_canonical_resource: str
) -> TokenAudienceValidation:
  """Validate, on the MCP server side, that a presented token was issued for THIS server as
  the intended audience, rejecting any token whose audience is some other resource.
  (R-23.6-f, R-23.6-g, R-23.6-h)

  Compares the token's audience to this server's canonical resource identifier using S35's
  ``resource_identifiers_equal`` (accepting uppercase scheme/host for robustness,
  R-23.1-p). A server MUST only accept tokens valid for its own resources and MUST NOT
  accept (or forward) any other token (R-23.6-h). ``token_audience`` may be a single string
  or a list of strings.
  """
  audiences = token_audience if isinstance(token_audience, list) else [token_audience]
  matches = any(resource_identifiers_equal(aud, own_canonical_resource) for aud in audiences)
  if not matches:
    return TokenAudienceValidation(
      ok=False,
      reason=(
        f"token audience {token_audience!r} was not issued for this server "
        f'"{own_canonical_resource}"; reject and never forward (R-23.6-g, R-23.6-h)'
      ),
    )
  return TokenAudienceValidation(ok=True)


@dataclass(frozen=True)
class TokenSelectionResult:
  """Outcome of :func:`select_token_for_server`."""

  ok: bool
  access_token: str | None = None
  reason: str | None = None


def select_token_for_server(
  *,
  server_issuer: str,
  server_canonical_resource: str,
  token_issuer: str,
  token_audience,
  access_token: str,
) -> TokenSelectionResult:
  """Select the access token a client may send to a given MCP server — strictly the one
  issued by that server's authorization server for that server, and no other. (R-23.6-i)

  Looks up the token recorded for ``server_issuer`` and confirms its audience is the
  server's ``server_canonical_resource``. When no matching token exists, returns an error so
  the client sends NOTHING rather than a wrong-audience token — a client MUST NOT send any
  token other than one issued for that server (R-23.6-i).
  """
  if token_issuer != server_issuer:
    return TokenSelectionResult(
      ok=False,
      reason=(
        f'token was issued by "{token_issuer}", not by this server\'s authorization server '
        f'"{server_issuer}"; MUST NOT send it (R-23.6-i)'
      ),
    )
  audience = validate_token_audience(token_audience, server_canonical_resource)
  if not audience.ok:
    return TokenSelectionResult(ok=False, reason=audience.reason)
  return TokenSelectionResult(ok=True, access_token=access_token)


# ─── Access-token usage (§23.8, R-23.8-a – R-23.8-f) ─────────────────────────────

def build_bearer_authorization_header(access_token: str) -> str:
  """Build the ``Authorization: Bearer <access-token>`` request header value a client MUST
  send on every request to the MCP server. (R-23.8-a, R-23.8-b)

  :raises ValueError: When ``access_token`` is empty.
  """
  if not access_token:
    raise ValueError("access token MUST NOT be empty (R-23.8-b)")
  return f"{BEARER_AUTH_SCHEME} {access_token}"


_BEARER_HEADER_RE = re.compile(r"^(\S+)\s+(.+)$")


def extract_bearer_token(header_value: str | None) -> str | None:
  """Extract the bearer token from an ``Authorization`` header value, or ``None`` when the
  header is absent or does not use the ``Bearer`` scheme. (R-23.8-b)

  The scheme match is case-insensitive per RFC 7235.
  """
  if header_value is None:
    return None
  match = _BEARER_HEADER_RE.match(header_value.strip())
  if match is None or match.group(1).lower() != BEARER_AUTH_SCHEME.lower():
    return None
  return match.group(2).strip()


def url_contains_access_token_in_query(request_url: str) -> bool:
  """Return ``True`` when a URL carries an ``access_token`` in its query string, which a
  client MUST NOT do. (R-23.8-c)

  Use to assert that a request URL does not smuggle the token in the query string; the token
  belongs only in the ``Authorization`` header (R-23.8-b).
  """
  parts = urlsplit(request_url)
  if parts.scheme != "" and parts.netloc != "":
    keys = {key for key, _ in parse_qsl(parts.query, keep_blank_values=True)}
    return "access_token" in keys
  return re.search(r"[?&]access_token=", request_url) is not None


@dataclass
class TokenValidationContext:
  """A description of what an operation requires, against which the MCP server validates a
  presented token on every request. (R-23.8-d)
  """

  #: This server's canonical resource identifier (the expected audience). (R-23.8-d)
  own_canonical_resource: str
  #: The protected-resource metadata URI for the ``WWW-Authenticate`` challenge.
  resource_metadata: str
  #: The scopes this specific operation requires; empty when none. (R-23.8-d, R-23.8-f)
  required_scopes: list[str] | None = None


@dataclass
class PresentedToken:
  """The validated facts about a presented token, supplied by signature/introspection."""

  #: Whether the signature or introspection result is valid. (R-23.8-d)
  active: bool
  #: Whether the token is unexpired. (R-23.8-d)
  expired: bool
  #: The token's audience claim. (R-23.8-d)
  audience: object
  #: The scopes the token grants. (R-23.8-d)
  scopes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class AccessTokenValidation:
  """Outcome of :func:`validate_access_token_request`."""

  ok: bool
  #: On failure, the ``401``/``403`` challenge to return.
  challenge: object = None


def validate_access_token_request(
  token: PresentedToken | None, context: TokenValidationContext
) -> AccessTokenValidation:
  """Validate a presented access token on the MCP server side, on EVERY request, yielding a
  ``401``/``403`` challenge on failure. (R-23.8-a, R-23.8-d, R-23.8-e, R-23.8-f)

  The server treats each request independently and revalidates the token each time
  (R-23.8-a). The checks, in order:
    - missing / inactive / expired token → ``401 Unauthorized`` (R-23.8-e);
    - wrong audience → ``401 Unauthorized`` (the token was not issued for this server;
      R-23.6-f/g, R-23.8-d/e);
    - valid token lacking a required scope → ``403 Forbidden`` with an ``insufficient_scope``
      challenge (R-23.8-f).
  """
  required_scopes = context.required_scopes or []

  # Missing / invalid / expired → 401. (R-23.8-e)
  if token is None or not token.active or token.expired:
    return AccessTokenValidation(
      ok=False,
      challenge=build_unauthorized_response(
        resource_metadata=context.resource_metadata,
        scope=" ".join(required_scopes) if len(required_scopes) > 0 else None,
      ),
    )

  # Wrong audience → 401: the token was not issued for this server. (R-23.6-f/g, R-23.8-d/e)
  audience = validate_token_audience(token.audience, context.own_canonical_resource)
  if not audience.ok:
    return AccessTokenValidation(
      ok=False,
      challenge=build_unauthorized_response(
        resource_metadata=context.resource_metadata,
        scope=" ".join(required_scopes) if len(required_scopes) > 0 else None,
      ),
    )

  # Valid token lacking required scope → 403 insufficient_scope. (R-23.8-f)
  missing = [s for s in required_scopes if s not in token.scopes]
  if len(missing) > 0:
    return AccessTokenValidation(
      ok=False,
      challenge=build_insufficient_scope_response(
        scope=" ".join(required_scopes),
        resource_metadata=context.resource_metadata,
        error_description=f"missing required scope(s): {' '.join(missing)}",
      ),
    )

  return AccessTokenValidation(ok=True)
