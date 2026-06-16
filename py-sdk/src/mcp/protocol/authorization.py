"""S35 — Authorization I: model, applicability & metadata discovery (§23.1–§23.3).

The foundation of MCP authorization for HTTP-based transports: the OAuth 2.1 security
model (the MCP server is an OAuth 2.1 resource server fronted by one or more independent
authorization servers), how an unauthorized or under-scoped request is signaled at the
HTTP layer (``401`` / ``403`` with a ``Bearer`` ``WWW-Authenticate`` challenge), and the
two-stage ``.well-known`` metadata-discovery chain a client walks — first the server's
protected-resource metadata, then the selected authorization server's metadata.

This module provides:
  - applicability predicates — which transports §23 governs (HTTP only; stdio MUST NOT
    use it; other transports follow their own best practices) (R-23.1-a – R-23.1-c);
  - per-authorization-server credential isolation, keyed by ``issuer``
    (R-23.1-i – R-23.1-l);
  - canonical-resource-identifier construction/validation (R-23.1-m – R-23.1-s);
  - the ``401`` and ``403`` ``WWW-Authenticate`` challenge builders and a parser
    (R-23.1-t – R-23.1-ad);
  - ``ProtectedResourceMetadata`` schema + validator and the protected-resource
    well-known discovery order (R-23.2-a – R-23.2-j);
  - ``AuthorizationServerMetadata`` schema + validator and the authorization-server
    well-known discovery order with issuer-match validation (R-23.3-a – R-23.3-j).

Out of scope (owned elsewhere, per the story):
  - the authorization-code-with-PKCE flow, token/audience binding, bearer-header usage
    details, and refresh — :mod:`mcp.protocol.authorization_flow` (§23.4–§23.10);
  - client registration, the client-side step-up authorization flow, and consolidated
    security considerations — :mod:`mcp.protocol.authorization_registration`
    (§23.11–§23.19).

Mirrors the TS SDK's ``protocol/authorization.ts``. Validation is performed with
``jsonschema`` (the Python analogue of the TS SDK's Zod schemas); wire objects are plain
dicts. Authorization is an HTTP-transport-only concern.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator

# ─── Applicability and transports (§23.1, R-23.1-a – R-23.1-c) ───────────────────

#: The transport families relevant to authorization applicability.
#:
#: ``"http"`` is the Streamable HTTP transport of §9 — the only family §23 governs.
#: ``"stdio"`` is the §8 stdio transport, which MUST NOT use this flow. ``"other"``
#: stands for any transport that is neither — it follows its own established security
#: best practices and is outside §23's scope. (R-23.1-a – R-23.1-c)
TransportFamily = str  # "http" | "stdio" | "other"

#: How a client conveys credentials: ``"bearer"`` | ``"environment"`` | ``"best-practice"``.
CredentialConveyance = str


def authorization_applies_to(transport: TransportFamily) -> bool:
  """Return ``True`` when the §23 authorization flow applies to ``transport``.

  Authorization as defined in §23 applies ONLY to HTTP-based transports (R-23.1-a). The
  stdio transport MUST NOT use it — for stdio, credentials are conveyed out of band
  through the child-process environment (R-23.1-b). Any other transport MUST follow its
  own established security best practices and is outside §23 (R-23.1-c).
  """
  return transport == "http"


def authorization_forbidden_for(transport: TransportFamily) -> bool:
  """Return ``True`` when ``transport`` MUST NOT use the §23 authorization flow.

  Only stdio is explicitly forbidden from using it (R-23.1-b); ``"other"`` transports are
  merely outside §23's scope (R-23.1-c), not forbidden, so this is ``True`` only for
  ``"stdio"``.
  """
  return transport == "stdio"


def credential_conveyance_for(transport: TransportFamily) -> CredentialConveyance:
  """Return how credentials are conveyed for ``transport``. (R-23.1-a – R-23.1-c)

    - ``"http"`` → the OAuth 2.1 bearer-token flow (``"bearer"``).
    - ``"stdio"`` → out-of-band via the child-process environment (``"environment"``).
    - ``"other"`` → that transport's own ``"best-practice"`` mechanism.
  """
  if transport == "http":
    return "bearer"
  if transport == "stdio":
    return "environment"
  return "best-practice"


# ─── HTTP status codes for authorization errors (§23.1) ──────────────────────────

#: HTTP ``401``: authorization required, or token missing/invalid/expired. (R-23.1-t)
UNAUTHORIZED_STATUS = 401
#: HTTP ``403``: invalid scope or insufficient permissions. (R-23.1-aa)
AUTHORIZATION_FORBIDDEN_STATUS = 403
#: HTTP ``400``: malformed authorization request. (§23.1 status table)
AUTHORIZATION_BAD_REQUEST_STATUS = 400

#: The HTTP ``WWW-Authenticate`` response header name. (R-23.1-u)
WWW_AUTHENTICATE_HEADER = "WWW-Authenticate"
#: The authentication scheme every MCP challenge uses. (R-23.1-u)
BEARER_AUTH_SCHEME = "Bearer"
#: The ``error`` code carried by an insufficient-scope ``403`` challenge. (R-23.1-ab)
INSUFFICIENT_SCOPE_ERROR = "insufficient_scope"


# ─── Header access (case-insensitive names) ──────────────────────────────────────

#: A bag of HTTP headers keyed by field name (names compared case-insensitively).
HttpHeaders = dict


def get_header(headers: HttpHeaders, name: str) -> str | None:
  """Return the value of header ``name``, matching the field name case-insensitively.

  Returns ``None`` when absent. Mirrors the TS SDK's ``getHeader`` from
  ``transport/http/headers.ts``. (R-9.3-b)
  """
  target = name.lower()
  for key, value in headers.items():
    if isinstance(key, str) and key.lower() == target:
      return value
  return None


# ─── Per-authorization-server credential isolation (§23.1, R-23.1-i – R-23.1-l) ──

@dataclass
class AuthorizationServerRegistration:
  """Registration state held for a single authorization server, keyed by its ``issuer``.

  A client MUST store this separately per authorization server (R-23.1-i); credentials
  registered with one server MUST NOT be assumed valid at another (R-23.1-j). The concrete
  ``client_id``/token fields are filled in by the flow/registration modules — this story
  only owns the per-``issuer`` isolation contract.
  """

  #: The authorization server's ``issuer`` identifier URL; the isolation key.
  issuer: str
  #: OPTIONAL registered client identifier.
  client_id: str | None = None
  #: OPTIONAL issued access token.
  access_token: str | None = None
  #: OPTIONAL issued refresh token.
  refresh_token: str | None = None


class CredentialStore:
  """A per-authorization-server credential store keyed by ``issuer``. (R-23.1-i)

  Enforces the four isolation rules of §23.1:
    - registration state is kept separate per ``issuer`` (R-23.1-i);
    - :meth:`credentials_for` never returns another server's credentials, so a caller
      cannot assume one server's credentials work at another (R-23.1-j);
    - :meth:`needs_reregistration` reports ``True`` when the indicated authorization
      server changes, so the client does not reuse the previous server's credentials
      (R-23.1-k) and re-registers/re-discovers against the new one (R-23.1-l).
  """

  def __init__(self) -> None:
    self._by_issuer: dict[str, AuthorizationServerRegistration] = {}

  def register(self, registration: AuthorizationServerRegistration) -> None:
    """Record (or replace) the registration state for ``registration.issuer``.

    Each ``issuer`` keeps an isolated entry. (R-23.1-i)
    """
    self._by_issuer[registration.issuer] = AuthorizationServerRegistration(
      issuer=registration.issuer,
      client_id=registration.client_id,
      access_token=registration.access_token,
      refresh_token=registration.refresh_token,
    )

  def credentials_for(self, issuer: str) -> AuthorizationServerRegistration | None:
    """Return the registration state for ``issuer``, or ``None`` when none is stored.

    Never returns another ``issuer``'s credentials. (R-23.1-i, R-23.1-j)
    """
    found = self._by_issuer.get(issuer)
    if found is None:
      return None
    return AuthorizationServerRegistration(
      issuer=found.issuer,
      client_id=found.client_id,
      access_token=found.access_token,
      refresh_token=found.refresh_token,
    )

  def has_credentials_for(self, issuer: str) -> bool:
    """Return ``True`` when registration state exists for ``issuer``."""
    return issuer in self._by_issuer

  def needs_reregistration(self, previous_issuer: str | None, current_issuer: str) -> bool:
    """Return ``True`` when moving from ``previous_issuer`` to ``current_issuer`` requires
    the client to re-register / re-discover rather than reuse credentials.

    ``True`` whenever the indicated authorization server changed (the issuers differ) or
    no credentials are yet stored for ``current_issuer``. A client MUST NOT reuse a
    different server's credentials (R-23.1-k) and MUST re-register or re-discover against
    the new one (R-23.1-l).
    """
    if previous_issuer is not None and previous_issuer != current_issuer:
      return True
    return not self.has_credentials_for(current_issuer)


# ─── Canonical resource identifier (§23.1, R-23.1-m – R-23.1-s) ──────────────────

@dataclass(frozen=True)
class CanonicalResourceResult:
  """A successfully validated canonical resource identifier."""

  ok: bool
  #: The canonicalized identifier (lowercase scheme + host, no fragment).
  canonical: str | None = None
  #: Human-readable reason the candidate is not a valid identifier (when ``ok`` is False).
  reason: str | None = None


# Backwards/parity alias: the TS union of {ok:true,canonical} | {ok:false,reason}.
CanonicalResourceValidation = CanonicalResourceResult
CanonicalResourceError = CanonicalResourceResult


def _is_loopback_host(host: str) -> bool:
  """Return ``True`` when ``host`` denotes loopback / local development, for which the
  ``http`` scheme is permitted on a canonical resource identifier. (R-23.1-n)
  """
  h = host.lower()
  return h in ("localhost", "127.0.0.1", "[::1]", "::1")


def _origin_of(parts) -> str:
  """Build the WHATWG-style origin (``scheme://host[:port]``) with a lowercased scheme
  and host, preserving any non-default port.
  """
  host = parts.hostname or ""
  port = f":{parts.port}" if parts.port is not None else ""
  return f"{parts.scheme.lower()}://{host}{port}"


def canonicalize_resource_identifier(endpoint_url: str) -> CanonicalResourceResult:
  """Validate and canonicalize an MCP server endpoint URL into its canonical resource
  identifier. (§23.1, R-23.1-m – R-23.1-s)

  Enforced constraints:
    - MUST be an absolute URI (R-23.1-m); a bare host like ``mcp.example.com`` (no scheme)
      is rejected.
    - MUST use ``https``, or ``http`` only for a loopback/local host (R-23.1-n).
    - MUST NOT contain a fragment component (R-23.1-o).

  Canonicalization applied for robustness (R-23.1-p): the scheme and host are lowercased.
  A trailing slash present on the input is preserved — callers SHOULD omit it unless
  semantically significant (R-23.1-s, see :func:`strip_default_trailing_slash`); this
  function does not strip it because it cannot know whether the slash is significant.
  """
  parts = urlsplit(endpoint_url)
  # Absolute URI: scheme + authority both present. (R-23.1-m)
  if parts.scheme == "" or parts.netloc == "" or parts.hostname is None:
    return CanonicalResourceResult(
      ok=False, reason="canonical resource identifier MUST be an absolute URI (R-23.1-m)"
    )

  scheme = parts.scheme.lower()
  if scheme not in ("https", "http"):
    return CanonicalResourceResult(
      ok=False,
      reason=f'unsupported scheme "{scheme}"; MUST be https (or http for loopback) (R-23.1-n)',
    )
  if scheme == "http" and not _is_loopback_host(parts.hostname):
    return CanonicalResourceResult(
      ok=False,
      reason="the http scheme is permitted only for loopback/local development (R-23.1-n)",
    )

  # Any non-empty fragment is rejected. (R-23.1-o)
  if parts.fragment != "":
    return CanonicalResourceResult(
      ok=False, reason="canonical resource identifier MUST NOT contain a fragment (R-23.1-o)"
    )

  origin = _origin_of(parts)
  # §23.1 (R-23.1-s): emit the bare-origin form for a host-root input so
  # ``https://h`` and ``https://h/`` stay canonically identical; otherwise keep the
  # case-sensitive path + query.
  if parts.path in ("", "/") and parts.query == "":
    canonical = origin
  else:
    query = f"?{parts.query}" if parts.query != "" else ""
    canonical = f"{origin}{parts.path}{query}"
  return CanonicalResourceResult(ok=True, canonical=canonical)


def is_valid_canonical_resource_identifier(endpoint_url: str) -> bool:
  """Return ``True`` when ``endpoint_url`` is a valid canonical resource identifier.
  (R-23.1-m – R-23.1-o)
  """
  return canonicalize_resource_identifier(endpoint_url).ok


def resource_identifiers_equal(a: str, b: str) -> bool:
  """Return ``a`` and ``b`` compared as canonical resource identifiers, accepting an
  uppercase scheme/host on either side. (R-23.1-p)

  The canonical form is lowercase scheme + host, but a receiver SHOULD accept uppercase
  scheme and host components for robustness; this canonicalizes both sides before
  comparing so ``HTTPS://MCP.EXAMPLE.COM/mcp`` matches ``https://mcp.example.com/mcp``.
  Returns ``False`` when either side is not a valid identifier. Path, query, and port are
  compared case-sensitively (only scheme and host are case-insensitive).
  """
  ca = canonicalize_resource_identifier(a)
  cb = canonicalize_resource_identifier(b)
  return ca.ok and cb.ok and ca.canonical == cb.canonical


def strip_default_trailing_slash(uri: str, slash_is_significant: bool = False) -> str:
  """Return ``uri`` with a single trailing slash removed when the slash is not
  semantically significant. (R-23.1-s)

  An implementation SHOULD use the trailing-slash-free form unless the slash is significant
  for the resource; the caller asserts significance via ``slash_is_significant``. A path of
  just ``"/"`` (the bare-host root) is left untouched — removing it would change the host's
  root into a schemeless string.
  """
  if slash_is_significant:
    return uri
  parts = urlsplit(uri)
  if parts.scheme != "" and parts.netloc != "":
    # Only strip a path-level trailing slash; leave the bare-host root ("/") intact.
    if parts.path not in ("", "/") and parts.path.endswith("/"):
      stripped_path = re.sub(r"/+$", "", parts.path)
      origin = _origin_of(parts)
      query = f"?{parts.query}" if parts.query != "" else ""
      frag = f"#{parts.fragment}" if parts.fragment != "" else ""
      return f"{origin}{stripped_path}{query}{frag}"
    return uri
  # Non-URL input: conservative string strip that never empties.
  if len(uri) > 1 and uri.endswith("/"):
    return re.sub(r"/+$", "", uri)
  return uri


# ─── WWW-Authenticate challenge (§23.1, R-23.1-t – R-23.1-ad) ────────────────────

@dataclass
class WwwAuthenticateChallenge:
  """The structured fields of a ``Bearer`` ``WWW-Authenticate`` challenge.

  Not a JSON object — the parameter set carried in the HTTP response header. On a ``401``
  ``resource_metadata`` is REQUIRED and ``scope`` SHOULD be present; on a ``403``
  insufficient-scope challenge ``error`` is ``"insufficient_scope"`` and ``scope``,
  ``resource_metadata``, and an OPTIONAL ``error_description`` accompany it. (R-23.1-v,
  R-23.1-w, R-23.1-ab, R-23.1-ad)
  """

  #: The authentication scheme; always ``Bearer`` for MCP. (R-23.1-u)
  scheme: str = BEARER_AUTH_SCHEME
  #: Absolute URI of the protected-resource metadata document. (R-23.1-v)
  resource_metadata: str | None = None
  #: Space-delimited scopes required for the operation. (R-23.1-w, R-23.1-ab)
  scope: str | None = None
  #: The failure code; ``"insufficient_scope"`` on a ``403``. (R-23.1-ab)
  error: str | None = None
  #: OPTIONAL human-readable description of the failure. (R-23.1-ad)
  error_description: str | None = None


@dataclass(frozen=True)
class UnauthorizedChallenge:
  """A built ``401`` Unauthorized challenge response (status + header value)."""

  #: HTTP status ``401``. (R-23.1-t)
  status: int
  #: The ``WWW-Authenticate`` header name + value pair. (R-23.1-u)
  headers: dict


@dataclass(frozen=True)
class InsufficientScopeChallenge:
  """A built ``403`` insufficient-scope challenge response (status + header value)."""

  #: HTTP status ``403``. (R-23.1-aa)
  status: int
  #: The ``WWW-Authenticate`` header name + value pair. (R-23.1-aa)
  headers: dict


def _quoted_param(key: str, value: str) -> str:
  """Serialize one challenge parameter as ``key="value"``, quoting per RFC 7235."""
  escaped = value.replace("\\", "\\\\").replace('"', '\\"')
  return f'{key}="{escaped}"'


def build_www_authenticate_value(
  *,
  scheme: str | None = None,
  resource_metadata: str | None = None,
  scope: str | None = None,
  error: str | None = None,
  error_description: str | None = None,
) -> str:
  """Build the ``WWW-Authenticate`` header value for a ``Bearer`` challenge from its
  structured fields. (R-23.1-u – R-23.1-w, R-23.1-ab – R-23.1-ad)

  Parameters are emitted in a stable order — ``error``, ``scope``, ``resource_metadata``,
  ``error_description`` — each only when present. The scheme (``Bearer``) always leads.
  The ``scheme`` argument is accepted for parity but is always emitted as ``Bearer``.
  """
  params: list[str] = []
  if error is not None:
    params.append(_quoted_param("error", error))
  if scope is not None:
    params.append(_quoted_param("scope", scope))
  if resource_metadata is not None:
    params.append(_quoted_param("resource_metadata", resource_metadata))
  if error_description is not None:
    params.append(_quoted_param("error_description", error_description))
  return f"{BEARER_AUTH_SCHEME} {', '.join(params)}" if params else BEARER_AUTH_SCHEME


def build_unauthorized_response(
  resource_metadata: str, scope: str | None = None
) -> UnauthorizedChallenge:
  """Build an MCP server's ``401 Unauthorized`` response with a ``Bearer``
  ``WWW-Authenticate`` header. (R-23.1-t, R-23.1-u, R-23.1-v, R-23.1-w)

  The header always carries the REQUIRED ``resource_metadata`` parameter (R-23.1-v) and
  SHOULD carry ``scope`` when the server can determine the required scopes (R-23.1-w). This
  ``401`` is an HTTP-layer response distinct from §22's JSON-RPC error codes and carries no
  JSON-RPC error body.

  :raises ValueError: When ``resource_metadata`` is empty — it is REQUIRED.
  """
  if not resource_metadata:
    raise ValueError("401 WWW-Authenticate MUST include resource_metadata (R-23.1-v)")
  value = build_www_authenticate_value(
    scheme=BEARER_AUTH_SCHEME, resource_metadata=resource_metadata, scope=scope
  )
  return UnauthorizedChallenge(
    status=UNAUTHORIZED_STATUS, headers={WWW_AUTHENTICATE_HEADER: value}
  )


def build_insufficient_scope_response(
  scope: str, resource_metadata: str, error_description: str | None = None
) -> InsufficientScopeChallenge:
  """Build an MCP server's ``403 Forbidden`` insufficient-scope response with a ``Bearer``
  ``WWW-Authenticate`` header. (R-23.1-aa – R-23.1-ad)

  The header carries ``error="insufficient_scope"``, the ``scope`` parameter, and a
  ``resource_metadata`` parameter (R-23.1-ab); the caller SHOULD pass the union of all
  scopes the operation needs so this is a single, complete challenge rather than an
  incremental one (R-23.1-ac). ``error_description`` is emitted only when supplied
  (R-23.1-ad).

  :raises ValueError: When ``scope`` or ``resource_metadata`` is empty.
  """
  if not scope:
    raise ValueError("403 insufficient_scope WWW-Authenticate MUST include scope (R-23.1-ab)")
  if not resource_metadata:
    raise ValueError(
      "403 insufficient_scope WWW-Authenticate MUST include resource_metadata (R-23.1-ab)"
    )
  value = build_www_authenticate_value(
    scheme=BEARER_AUTH_SCHEME,
    error=INSUFFICIENT_SCOPE_ERROR,
    scope=scope,
    resource_metadata=resource_metadata,
    error_description=error_description,
  )
  return InsufficientScopeChallenge(
    status=AUTHORIZATION_FORBIDDEN_STATUS, headers={WWW_AUTHENTICATE_HEADER: value}
  )


# Matches `key=value` where value is either a quoted string or a bare token.
_PARAM_RE = re.compile(r'([A-Za-z0-9._-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))')
_SCHEME_RE = re.compile(r"^(\S+)\s*(.*)$", re.DOTALL)
_UNESCAPE_RE = re.compile(r"\\(.)")


def parse_www_authenticate(header_value: str) -> WwwAuthenticateChallenge | None:
  """Parse a ``WWW-Authenticate`` header value carrying a ``Bearer`` challenge into its
  structured fields. (R-23.1-z)

  A client MUST be able to parse ``WWW-Authenticate`` headers and react to a ``401``
  (R-23.1-z); this is that parser. It accepts the auth-param forms RFC 7235 permits —
  quoted (``key="value"``) and bare (``key=value``) — comma-separated, with arbitrary
  surrounding whitespace, and unescapes ``\\"``/``\\\\`` inside quoted values. The scheme
  match is case-insensitive. Returns ``None`` when the value does not use the ``Bearer``
  scheme.
  """
  trimmed = header_value.strip()
  scheme_match = _SCHEME_RE.match(trimmed)
  if scheme_match is None or scheme_match.group(1).lower() != BEARER_AUTH_SCHEME.lower():
    return None

  params: dict[str, str] = {}
  params_part = scheme_match.group(2) or ""
  for m in _PARAM_RE.finditer(params_part):
    key = m.group(1).lower()
    if m.group(2) is not None:
      raw = _UNESCAPE_RE.sub(r"\1", m.group(2))
    else:
      raw = m.group(3) or ""
    params[key] = raw

  challenge = WwwAuthenticateChallenge(scheme=BEARER_AUTH_SCHEME)
  if "resource_metadata" in params:
    challenge.resource_metadata = params["resource_metadata"]
  if "scope" in params:
    challenge.scope = params["scope"]
  if "error" in params:
    challenge.error = params["error"]
  if "error_description" in params:
    challenge.error_description = params["error_description"]
  return challenge


def challenge_from_headers(headers: HttpHeaders) -> WwwAuthenticateChallenge | None:
  """Extract the parsed ``Bearer`` challenge from a bag of HTTP response headers, or
  ``None`` when there is no parseable ``WWW-Authenticate`` ``Bearer`` challenge. Header
  lookup is case-insensitive. (R-23.1-z)
  """
  value = get_header(headers, WWW_AUTHENTICATE_HEADER)
  return None if value is None else parse_www_authenticate(value)


def challenged_scopes(challenge: WwwAuthenticateChallenge) -> list[str]:
  """Resolve the scopes a client MUST treat as required for the request from a challenge.
  (R-23.1-x, R-23.1-y)

  The challenged scope set is authoritative: a client MUST treat it as the scopes required
  to satisfy the request (R-23.1-x) and MUST NOT assume any subset/superset relationship
  between it and ``scopes_supported`` from protected-resource metadata (R-23.1-y). This
  therefore derives the required scopes solely from the challenge's ``scope`` parameter,
  never from ``scopes_supported``. Returns ``[]`` when the challenge carried no ``scope``.
  """
  if challenge.scope is None:
    return []
  return [s for s in re.split(r"\s+", challenge.scope) if len(s) > 0]


def is_insufficient_scope_challenge(challenge: WwwAuthenticateChallenge) -> bool:
  """Return ``True`` when ``challenge`` is an insufficient-scope (``403``) challenge.
  (R-23.1-ab)
  """
  return challenge.error == INSUFFICIENT_SCOPE_ERROR


# ─── Protected Resource Metadata (§23.2, R-23.2-a – R-23.2-j) ────────────────────

#: JSON Schema for the OAuth 2.0 Protected Resource Metadata document the MCP server
#: publishes. (§23.2, R-23.2-h, R-23.2-i)
#:
#: ``resource`` is REQUIRED and MUST equal the server's canonical resource identifier
#: (R-23.2-h). ``authorization_servers`` is REQUIRED for MCP, MUST be present, and MUST
#: contain at least one entry (R-23.2-i). ``scopes_supported`` and
#: ``bearer_methods_supported`` are OPTIONAL. Additional RFC 9728 fields are preserved.
PROTECTED_RESOURCE_METADATA_SCHEMA = {
  "type": "object",
  "properties": {
    "resource": {"type": "string", "minLength": 1},
    "authorization_servers": {
      "type": "array",
      "items": {"type": "string"},
      "minItems": 1,
    },
    "scopes_supported": {"type": "array", "items": {"type": "string"}},
    "bearer_methods_supported": {"type": "array", "items": {"type": "string"}},
  },
  "required": ["resource", "authorization_servers"],
  "additionalProperties": True,
}

_PROTECTED_RESOURCE_METADATA_VALIDATOR = Draft202012Validator(PROTECTED_RESOURCE_METADATA_SCHEMA)


def is_protected_resource_metadata(value: object) -> bool:
  """Return ``True`` when ``value`` is a structurally valid ``ProtectedResourceMetadata``.
  (R-23.2-h, R-23.2-i)
  """
  return _PROTECTED_RESOURCE_METADATA_VALIDATOR.is_valid(value)


@dataclass(frozen=True)
class ProtectedResourceMetadataValidation:
  """Outcome of :func:`validate_protected_resource_metadata`."""

  ok: bool
  metadata: dict | None = None
  reason: str | None = None


def validate_protected_resource_metadata(
  value: object, expected_canonical_resource: str
) -> ProtectedResourceMetadataValidation:
  """Validate a fetched protected-resource metadata document against the MCP server it is
  contacting. (§23.2, R-23.2-h, R-23.2-i, R-23.2-j)

  Checks:
    - the document is structurally valid (``resource`` present, non-empty
      ``authorization_servers``) (R-23.2-h, R-23.2-i);
    - ``resource`` equals the server's canonical resource identifier, accepting an
      uppercase scheme/host on either side (R-23.2-h via R-23.1-p, R-23.2-j).

  On success the client then selects an authorization server from ``authorization_servers``
  (see :func:`select_authorization_server`).
  """
  errors = sorted(
    _PROTECTED_RESOURCE_METADATA_VALIDATOR.iter_errors(value), key=lambda e: list(e.path)
  )
  if errors:
    return ProtectedResourceMetadataValidation(
      ok=False, reason=f"invalid ProtectedResourceMetadata: {errors[0].message}"
    )
  resource = value["resource"]
  if not resource_identifiers_equal(resource, expected_canonical_resource):
    return ProtectedResourceMetadataValidation(
      ok=False,
      reason=(
        f'resource "{resource}" does not match the MCP server\'s canonical resource '
        f'identifier "{expected_canonical_resource}" (R-23.2-h, R-23.2-j)'
      ),
    )
  return ProtectedResourceMetadataValidation(ok=True, metadata=dict(value))


def select_authorization_server(metadata: dict, prefer=None) -> str | None:
  """Select one authorization-server ``issuer`` from a protected-resource metadata
  document. (R-23.2-j)

  Each listed authorization server is independent and selecting which to use is the
  client's responsibility. By default this picks the first listed issuer; a ``prefer``
  callback lets a caller impose its own selection policy (the first issuer for which
  ``prefer`` returns ``True`` wins, falling back to the first listed issuer when none
  matches). Returns ``None`` only for an empty list (which a valid document never has —
  R-23.2-i).
  """
  servers = metadata.get("authorization_servers") or []
  if len(servers) == 0:
    return None
  if prefer is not None:
    for issuer in servers:
      if prefer(issuer):
        return issuer
  return servers[0]


# ─── Protected-resource well-known discovery (§23.2, R-23.2-c – R-23.2-g) ────────

#: The protected-resource metadata well-known path suffix. (§23.2)
PROTECTED_RESOURCE_WELL_KNOWN = "/.well-known/oauth-protected-resource"


def protected_resource_well_known_uris(endpoint_url: str) -> list[str]:
  """Build the ordered list of protected-resource-metadata well-known URIs to try for an
  MCP server endpoint, when no ``resource_metadata`` header URI is available. (R-23.2-e,
  R-23.2-f)

  The order MUST be:
    1. path-aware insertion — ``https://<host>/.well-known/oauth-protected-resource/<path>``;
    2. root — ``https://<host>/.well-known/oauth-protected-resource``.

  When the endpoint has no path beyond ``/``, the path-aware form coincides with the root
  form and only the root URI is returned (no duplicate).

  :raises ValueError: When ``endpoint_url`` is not an absolute URI.
  """
  parts = urlsplit(endpoint_url)
  if parts.scheme == "" or parts.netloc == "" or parts.hostname is None:
    raise ValueError(f"endpoint URL is not an absolute URI: {endpoint_url!r}")
  origin = _origin_of(parts)
  path = parts.path.strip("/")
  root = f"{origin}{PROTECTED_RESOURCE_WELL_KNOWN}"
  if path == "":
    return [root]
  return [f"{origin}{PROTECTED_RESOURCE_WELL_KNOWN}/{path}", root]


def resolve_protected_resource_metadata_uris(
  *, header_resource_metadata: str | None = None, endpoint_url: str | None = None
) -> list[str]:
  """Resolve where to fetch protected-resource metadata from, honoring discovery
  precedence. (R-23.2-c, R-23.2-d, R-23.2-e, R-23.2-g)

    - When the ``401``'s ``WWW-Authenticate`` header carried ``resource_metadata``, the
      client MUST use that URI — it is returned as the single entry (R-23.2-d).
    - Otherwise the ordered well-known URIs are returned for the client to try in order,
      using the first that yields a valid document (R-23.2-e, R-23.2-f).
    - When no header URI is available and ``endpoint_url`` is absent/unusable, the result
      is empty — the caller MUST then abort or fall back to pre-configured values
      (R-23.2-g).
  """
  if header_resource_metadata:
    return [header_resource_metadata]
  if not endpoint_url:
    return []
  try:
    return protected_resource_well_known_uris(endpoint_url)
  except ValueError:
    return []


# ─── Authorization Server Metadata (§23.3, R-23.3-a – R-23.3-j) ──────────────────

#: JSON Schema for the metadata document an authorization server publishes.
#: (§23.3, R-23.3-f – R-23.3-h)
#:
#: ``issuer``, ``authorization_endpoint``, and ``token_endpoint`` are REQUIRED. The
#: ``response_types_supported`` MUST-include-"code" (R-23.3-i) and
#: ``code_challenge_methods_supported`` MUST-include-"S256" (R-23.3-j) constraints are
#: applied in :func:`is_authorization_server_metadata` because JSON Schema cannot express
#: "MUST contain a specific item when present". The issuer-match check (R-23.3-d/-e) is
#: applied at validation time. Additional RFC 8414 / OIDC fields are preserved.
AUTHORIZATION_SERVER_METADATA_SCHEMA = {
  "type": "object",
  "properties": {
    "issuer": {"type": "string", "minLength": 1},
    "authorization_endpoint": {"type": "string", "minLength": 1},
    "token_endpoint": {"type": "string", "minLength": 1},
    "registration_endpoint": {"type": "string"},
    "scopes_supported": {"type": "array", "items": {"type": "string"}},
    "response_types_supported": {"type": "array", "items": {"type": "string"}},
    "grant_types_supported": {"type": "array", "items": {"type": "string"}},
    "code_challenge_methods_supported": {"type": "array", "items": {"type": "string"}},
    "token_endpoint_auth_methods_supported": {"type": "array", "items": {"type": "string"}},
    "authorization_response_iss_parameter_supported": {"type": "boolean"},
    "client_id_metadata_document_supported": {"type": "boolean"},
  },
  "required": ["issuer", "authorization_endpoint", "token_endpoint"],
  "additionalProperties": True,
}

_AUTHORIZATION_SERVER_METADATA_VALIDATOR = Draft202012Validator(AUTHORIZATION_SERVER_METADATA_SCHEMA)


def _as_metadata_refinement_error(value: object) -> str | None:
  """Apply the §23.3 ``superRefine`` constraints JSON Schema cannot express:
  ``response_types_supported`` MUST include ``"code"`` (R-23.3-i) and
  ``code_challenge_methods_supported`` MUST include ``"S256"`` (R-23.3-j) when present.
  Returns an error message, or ``None`` when both hold.
  """
  if not isinstance(value, dict):
    return None
  rts = value.get("response_types_supported")
  if rts is not None and "code" not in rts:
    return 'response_types_supported, when present, MUST include "code" (R-23.3-i)'
  ccms = value.get("code_challenge_methods_supported")
  if ccms is not None and "S256" not in ccms:
    return 'code_challenge_methods_supported, when present, MUST include "S256" (R-23.3-j)'
  return None


def is_authorization_server_metadata(value: object) -> bool:
  """Return ``True`` when ``value`` is a structurally valid ``AuthorizationServerMetadata``.
  (R-23.3-f – R-23.3-j)
  """
  if not _AUTHORIZATION_SERVER_METADATA_VALIDATOR.is_valid(value):
    return False
  return _as_metadata_refinement_error(value) is None


@dataclass(frozen=True)
class AuthorizationServerMetadataValidation:
  """Outcome of :func:`validate_authorization_server_metadata`."""

  ok: bool
  metadata: dict | None = None
  reason: str | None = None


def validate_authorization_server_metadata(
  value: object, expected_issuer: str
) -> AuthorizationServerMetadataValidation:
  """Validate a fetched authorization-server metadata document, including the mandatory
  issuer-match check. (§23.3, R-23.3-d, R-23.3-e, R-23.3-f – R-23.3-j)

  After confirming the document is structurally valid (REQUIRED fields present;
  ``response_types_supported``/``code_challenge_methods_supported`` constraints), it
  verifies that the document's ``issuer`` is identical to the issuer identifier used to
  construct the discovery URL (R-23.3-d). If they differ, the document MUST NOT be used
  (R-23.3-e) and this returns an error. The comparison is exact string identity, as the
  spec's attacker example requires.
  """
  errors = sorted(
    _AUTHORIZATION_SERVER_METADATA_VALIDATOR.iter_errors(value), key=lambda e: list(e.path)
  )
  if errors:
    return AuthorizationServerMetadataValidation(
      ok=False, reason=f"invalid AuthorizationServerMetadata: {errors[0].message}"
    )
  refine_error = _as_metadata_refinement_error(value)
  if refine_error is not None:
    return AuthorizationServerMetadataValidation(
      ok=False, reason=f"invalid AuthorizationServerMetadata: {refine_error}"
    )
  issuer = value["issuer"]
  if issuer != expected_issuer:
    return AuthorizationServerMetadataValidation(
      ok=False,
      reason=(
        f'issuer "{issuer}" does not match the issuer used to construct the discovery '
        f'URL "{expected_issuer}"; MUST NOT use the document (R-23.3-d, R-23.3-e)'
      ),
    )
  return AuthorizationServerMetadataValidation(ok=True, metadata=dict(value))


# ─── Authorization-server well-known discovery (§23.3, R-23.3-b, R-23.3-c) ───────

#: OAuth 2.0 Authorization Server Metadata well-known suffix. (§23.3)
OAUTH_AS_WELL_KNOWN = "/.well-known/oauth-authorization-server"
#: OpenID Connect Discovery well-known suffix. (§23.3)
OPENID_CONFIGURATION_WELL_KNOWN = "/.well-known/openid-configuration"


def authorization_server_well_known_uris(issuer: str) -> list[str]:
  """Build the ordered list of authorization-server metadata well-known URIs to try for an
  ``issuer``, in the exact specified priority order. (R-23.3-b, R-23.3-c)

  For an issuer **with a path** (e.g. ``https://auth.example.com/tenant1``):
    1. OAuth AS Metadata, path insertion — ``…/.well-known/oauth-authorization-server/tenant1``;
    2. OIDC Discovery, path insertion — ``…/.well-known/openid-configuration/tenant1``;
    3. OIDC Discovery, path appending — ``…/tenant1/.well-known/openid-configuration``.

  For an issuer **without a path** (e.g. ``https://auth.example.com``):
    1. ``…/.well-known/oauth-authorization-server``;
    2. ``…/.well-known/openid-configuration``.

  Both discovery mechanisms (OAuth AS Metadata and OIDC Discovery) are covered, so a client
  building from this list supports both (R-23.3-b). The client uses the first that returns a
  valid, issuer-matching document.

  :raises ValueError: When ``issuer`` is not an absolute URI.
  """
  parts = urlsplit(issuer)
  if parts.scheme == "" or parts.netloc == "" or parts.hostname is None:
    raise ValueError(f"issuer is not an absolute URI: {issuer!r}")
  origin = _origin_of(parts)
  path = parts.path.strip("/")
  if path == "":
    return [
      f"{origin}{OAUTH_AS_WELL_KNOWN}",
      f"{origin}{OPENID_CONFIGURATION_WELL_KNOWN}",
    ]
  return [
    f"{origin}{OAUTH_AS_WELL_KNOWN}/{path}",
    f"{origin}{OPENID_CONFIGURATION_WELL_KNOWN}/{path}",
    f"{origin}/{path}{OPENID_CONFIGURATION_WELL_KNOWN}",
  ]
