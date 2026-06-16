"""S37 — Authorization III: registration mechanisms, scopes & security (§23.11–§23.19).

S35 (:mod:`mcp.protocol.authorization`) established the authorization model and the
protected-resource / authorization-server metadata discovery; S36
(:mod:`mcp.protocol.authorization_flow`) built the authorization-code-with-PKCE flow, token
exchange, audience binding, and the registration *data types* (CIMD / DCR schemas, the
``ClientIdMechanism`` enum, scope resolution helpers, the PKCE and ``iss`` validators). This
module completes the authorization surface by adding the parts S37 owns on top of that
foundation, WITHOUT re-implementing the PKCE/token flow:

  - **metadata-driven mechanism selection** — choosing the first applicable ``client_id``
    mechanism after inspecting the *validated authorization-server metadata*, gating CIMD on
    ``client_id_metadata_document_supported`` and DCR on ``registration_endpoint``
    (R-23.11-a – R-23.11-e);
  - **CIMD client-side hosting predicates** — the ``https``-with-path ``client_id`` URL rule
    and the document-identity rule, reusing S36's ``is_valid_cimd_client_id_url`` /
    ``validate_client_id_metadata_document`` and adding an AS-side cache (HTTP-cache-header
    aware) and host-domain trust policy (R-23.12-a – R-23.12-l);
  - **``application_type`` selection & DCR retry** — reusing S36's ``application_type_for`` /
    ``handle_dynamic_client_registration_response``, adding a loopback-aware native/web
    classifier and a bounded retry that adjusts the ``application_type``
    (R-23.15-a – R-23.15-f);
  - **credential binding to the issuer** — the issuer-keyed re-registration decision with the
    CIMD exemption and the SHOULD-surface-error behaviour, by exact string comparison
    (R-23.16-a – R-23.16-g);
  - **discovery robustness** — predicate wrappers over S35's
    ``protected_resource_well_known_uris`` / ``authorization_server_well_known_uris``, the
    ``authorization_servers`` requirement, and per-AS registration-state separation
    (R-23.17-a – R-23.17-i);
  - **scope selection & the step-up authorization flow** — the least-privilege selection
    (reusing S36's ``resolve_authorization_scope``), the scope *union* that never drops
    already-granted scopes, the bounded retry, and the per-resource-and-operation upgrade
    tracker (R-23.18-a – R-23.18-r, R-23.1-ae – R-23.1-ag);
  - **authorization security requirements** — consolidated predicates for audience binding,
    exact issuer validation, PKCE-mandatory, ``state``, token confidentiality, and
    refresh-token handling, delegating the mechanics to S36 (R-23.19-a – R-23.19-u).

Mirrors the TS SDK's ``protocol/authorization-registration.ts``. Builds on S35/S36 symbols,
none of which are redefined here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlsplit

from mcp.protocol.authorization import (
  authorization_server_well_known_uris,
  protected_resource_well_known_uris,
)
from mcp.protocol.authorization_flow import (
  GRANT_TYPE_REFRESH_TOKEN,
  OFFLINE_ACCESS_SCOPE,
  application_type_for,
  handle_dynamic_client_registration_response,
  is_valid_cimd_client_id_url,
  resolve_authorization_scope,
  url_contains_access_token_in_query,
  validate_issuer,
)

# ─── §23.11 Obtaining a client_id & selecting a mechanism (R-23.11-a – R-23.11-e) ─

#: The authorization-server-metadata flag that gates the CIMD mechanism. When ``True``, the
#: AS supports Client ID Metadata Documents. (R-23.11-d)
CLIENT_ID_METADATA_DOCUMENT_SUPPORTED_FIELD = "client_id_metadata_document_supported"


@dataclass(frozen=True)
class RegistrationMechanismSelection:
  """The mechanism chosen by :func:`select_registration_mechanism`, with the reason it
  applied.
  """

  #: The selected mechanism, or ``"prompt"`` when none applies. (R-23.11-b)
  mechanism: str
  #: Human-readable explanation of why this mechanism was selected.
  reason: str


def select_registration_mechanism(
  *,
  authorization_server_metadata: dict,
  has_pre_registered_credentials: bool = False,
  supported_mechanisms=None,
) -> RegistrationMechanismSelection:
  """Select the ``client_id`` mechanism from the VALIDATED authorization-server metadata and
  the client's credential state, applying the §23.11 priority order and the metadata gates.
  (R-23.11-a, R-23.11-b, R-23.11-c, R-23.11-d, R-23.11-e)

  The order, using the first that applies:
    1. pre-registration — when the client already holds credentials for this AS;
    2. CIMD — only when the AS metadata sets ``client_id_metadata_document_supported: true``
       (R-23.11-d) AND the client supports it;
    3. DCR — only when the AS metadata advertises a ``registration_endpoint`` (R-23.11-e) AND
       the client supports it;
    4. ``prompt`` — otherwise prompt the user for client information.

  The function inspects the metadata before deciding (R-23.11-c) and never returns
  ``cimd``/``dcr`` when the corresponding gate is closed (R-23.11-d, R-23.11-e), so a caller
  acting on the result will not attempt a mechanism the AS does not support. This complements
  S36's ``select_client_id_mechanism``, which ranks a static capability set; here the live
  metadata flags are the deciding input.
  """
  supported = set(
    supported_mechanisms if supported_mechanisms is not None else ("pre-registration", "cimd", "dcr")
  )
  metadata = authorization_server_metadata

  if has_pre_registered_credentials is True and "pre-registration" in supported:
    return RegistrationMechanismSelection(
      mechanism="pre-registration",
      reason="pre-registered client information is already held for this authorization server (R-23.11-b)",
    )
  if metadata.get("client_id_metadata_document_supported") is True and "cimd" in supported:
    return RegistrationMechanismSelection(
      mechanism="cimd",
      reason="authorization-server metadata sets client_id_metadata_document_supported: true (R-23.11-b, R-23.11-d)",
    )
  if metadata.get("registration_endpoint") is not None and "dcr" in supported:
    return RegistrationMechanismSelection(
      mechanism="dcr",
      reason="authorization-server metadata advertises a registration_endpoint (R-23.11-b, R-23.11-e)",
    )
  return RegistrationMechanismSelection(
    mechanism="prompt",
    reason="no automated mechanism applies; prompt the user for client information (R-23.11-b)",
  )


def may_attempt_cimd(metadata: dict) -> bool:
  """Return ``True`` when a client MAY attempt CIMD against this authorization server — i.e.
  the metadata sets ``client_id_metadata_document_supported: true``. A client MUST NOT
  attempt CIMD otherwise. (R-23.11-d)
  """
  return metadata.get("client_id_metadata_document_supported") is True


def may_attempt_dcr(metadata: dict) -> bool:
  """Return ``True`` when a client MAY attempt Dynamic Client Registration against this
  authorization server — i.e. the metadata advertises a ``registration_endpoint``. A client
  MUST NOT attempt DCR otherwise. (R-23.11-e)
  """
  endpoint = metadata.get("registration_endpoint")
  return endpoint is not None and endpoint != ""


# ─── §23.12 Client ID Metadata Documents — client & AS side (R-23.12-a – R-23.12-l)

#: The ``private_key_jwt`` token-endpoint authentication method a CIMD client MAY use.
#: (R-23.12-f)
PRIVATE_KEY_JWT_AUTH_METHOD = "private_key_jwt"


def cimd_is_preferred_path(client_supports_cimd: bool, server_supports_cimd: bool) -> bool:
  """Return ``True`` when both a client and an authorization server should prefer CIMD as the
  registration path — both SHOULD support the mechanism. (R-23.12-a)
  """
  return client_supports_cimd and server_supports_cimd


def is_cimd_client_id_hosting_valid(client_id_url: str) -> bool:
  """Return ``True`` when ``client_id_url`` satisfies the CIMD client-side hosting rules: it
  is hosted at an ``https`` URL and the URL contains a path component. (R-23.12-b, R-23.12-c)

  Delegates the ``https``+path check to S36's ``is_valid_cimd_client_id_url``; surfaced here
  under the §23.12 atom so call sites read against this story's rule.
  """
  return is_valid_cimd_client_id_url(client_id_url)


def cimd_supports_private_key_jwt(document: dict) -> bool:
  """Return ``True`` when a CIMD client MAY authenticate to the token endpoint with
  ``private_key_jwt``: the document declares that method and conveys an appropriate
  ``jwks``/``jwks_uri``. (R-23.12-f)
  """
  if document.get("token_endpoint_auth_method") != PRIVATE_KEY_JWT_AUTH_METHOD:
    return False
  return document.get("jwks") is not None or document.get("jwks_uri") is not None


@dataclass
class CimdCacheControl:
  """The HTTP caching directives an authorization server honours when caching a fetched CIMD
  document. (R-23.12-k)
  """

  #: ``max-age`` in seconds from ``Cache-Control``, if any.
  max_age_seconds: int | None = None
  #: ``True`` when ``Cache-Control: no-store`` (or ``no-cache``) forbids caching.
  no_store: bool | None = None


@dataclass
class _CachedCimdEntry:
  """A cached CIMD document with its HTTP-cache freshness bookkeeping. (R-23.12-k)"""

  document: dict
  #: Epoch milliseconds after which the cache entry is stale; ``None`` ⇒ never expires.
  expires_at_ms: float | None = None


class CimdDocumentCache:
  """An authorization-server-side cache for fetched CIMD documents that respects HTTP cache
  headers and applies a host-domain trust policy. (R-23.12-k, R-23.12-l)

  The AS SHOULD cache documents (R-23.12-k) and SHOULD apply CIMD security considerations
  such as a trust policy over allowed client-hosting domains (R-23.12-l). This cache enforces
  both: an optional ``trust_host`` predicate rejects documents hosted on disallowed domains
  before they are stored, and a ``Cache-Control: no-store``/``no-cache`` directive (or a
  non-positive ``max-age``) keeps a document out of the cache.
  """

  def __init__(
    self,
    *,
    trust_host: Callable[[str], bool] | None = None,
    now: Callable[[], float] | None = None,
  ) -> None:
    """:param trust_host: OPTIONAL host-domain trust policy; a document whose ``client_id``
      host fails this predicate is never cached or returned (R-23.12-l). Defaults to trusting
      all hosts.
    :param now: OPTIONAL clock (epoch ms) for testing; defaults to a millisecond wall clock.
    """
    self._by_url: dict[str, _CachedCimdEntry] = {}
    self._trust_host = trust_host if trust_host is not None else (lambda host: True)
    if now is not None:
      self._now = now
    else:
      import time

      self._now = lambda: time.time() * 1000

  def is_host_trusted(self, client_id_url: str) -> bool:
    """Return ``True`` when the host of ``client_id_url`` is permitted by the trust policy.
    (R-23.12-l)
    """
    parts = urlsplit(client_id_url)
    if parts.hostname is None:
      return False
    # WHATWG `URL.host` == host[:port] (no userinfo).
    host = parts.hostname + (f":{parts.port}" if parts.port is not None else "")
    return self._trust_host(host)

  def store(
    self, client_id_url: str, document: dict, cache_control: CimdCacheControl | None = None
  ) -> bool:
    """Cache a fetched CIMD document keyed by its ``client_id`` URL, honouring HTTP cache
    directives and the trust policy. Returns ``True`` when the document was stored, ``False``
    when caching was declined (untrusted host, ``no-store``, or a non-positive ``max-age``).
    (R-23.12-k, R-23.12-l)
    """
    cache_control = cache_control if cache_control is not None else CimdCacheControl()
    if not self.is_host_trusted(client_id_url):
      return False
    if cache_control.no_store is True:
      return False
    if cache_control.max_age_seconds is not None and cache_control.max_age_seconds <= 0:
      return False
    if cache_control.max_age_seconds is not None:
      expires_at_ms: float | None = self._now() + cache_control.max_age_seconds * 1000
    else:
      expires_at_ms = None
    self._by_url[client_id_url] = _CachedCimdEntry(document=document, expires_at_ms=expires_at_ms)
    return True

  def get(self, client_id_url: str) -> dict | None:
    """Return the cached document for ``client_id_url`` when present, trusted, and still
    fresh; otherwise ``None``. A stale entry is evicted on access. (R-23.12-k)
    """
    entry = self._by_url.get(client_id_url)
    if entry is None:
      return None
    if not self.is_host_trusted(client_id_url):
      return None
    if entry.expires_at_ms is not None and self._now() >= entry.expires_at_ms:
      del self._by_url[client_id_url]
      return None
    return entry.document


# ─── §23.15 application_type selection & DCR retry (R-23.15-a – R-23.15-f) ────────

def _is_loopback_redirect_host(host: str) -> bool:
  """Return ``True`` when ``host`` is a loopback / localhost host, the marker of a native
  (loopback-redirect) client for ``application_type`` selection. (R-23.15-b)
  """
  h = re.sub(r":\d+$", "", host.lower())
  return h in ("localhost", "127.0.0.1", "[::1]", "::1")


def application_type_for_redirect_uris(redirect_uris) -> str:
  """Classify a set of redirect URIs as native or web and return the ``application_type`` a
  client SHOULD register, consistent with those URIs. (R-23.15-a, R-23.15-b, R-23.15-c)

  Redirect URIs that all resolve to a loopback/localhost host indicate a native application
  (desktop/mobile/CLI/locally hosted web app) → ``"native"``; otherwise a remote
  browser-based application → ``"web"``. The classification follows S36's
  ``application_type_for`` with the loopback test that makes it consistent with the redirect
  URIs (R-23.15-a).
  """
  redirect_uris = list(redirect_uris)

  def all_loopback() -> bool:
    if len(redirect_uris) == 0:
      return False
    for uri in redirect_uris:
      parts = urlsplit(uri)
      if parts.netloc == "" or not _is_loopback_redirect_host(parts.netloc):
        return False
    return True

  return application_type_for(all_loopback())


@dataclass(frozen=True)
class DcrRetryResult:
  """Outcome of :func:`register_with_retry`: the final result and the attempts made."""

  #: The final DCR result — success or the last failure.
  result: object
  #: The ``application_type`` of each attempt, in order, for diagnostics.
  attempts: list[str]


def register_with_retry(
  *,
  initial_application_type: str,
  attempt: Callable[[str], object],
  max_attempts: int = 2,
) -> DcrRetryResult:
  """Perform Dynamic Client Registration with bounded retry, surfacing a meaningful error and
  retrying with an adjusted ``application_type`` when the AS rejects on a redirect-URI /
  application-type constraint. (R-23.15-d, R-23.15-e, R-23.15-f)

  A client MUST be prepared for OIDC redirect-URI rejection (R-23.15-d). Each attempt's
  response is interpreted by S36's ``handle_dynamic_client_registration_response``; on a
  retryable failure (e.g. a ``400`` redirect-URI/application-type constraint), the
  ``application_type`` is flipped (``native`` ↔ ``web``) for the next attempt (R-23.15-f), up
  to ``max_attempts``. The returned ``result`` carries a human-readable ``reason`` on failure
  for the client to surface (R-23.15-e). This never raises on an AS rejection — it returns the
  structured failure.

  ``attempt`` performs one registration POST for the given ``application_type``, returning the
  AS's HTTP status and parsed body as a mapping with ``"status"`` and ``"body"`` keys (or a
  ``(status, body)`` tuple). Injected so this is transport-agnostic.
  """
  from mcp.protocol.authorization_flow import DynamicClientRegistrationResult

  bound = max(1, max_attempts)
  attempts: list[str] = []
  application_type = initial_application_type
  last = DynamicClientRegistrationResult(
    ok=False, reason="no registration attempt was made", retryable=False
  )

  for _ in range(bound):
    attempts.append(application_type)
    outcome = attempt(application_type)
    if isinstance(outcome, tuple):
      status, body = outcome
    else:
      status, body = outcome["status"], outcome["body"]
    last = handle_dynamic_client_registration_response(status, body)
    if last.ok:
      return DcrRetryResult(result=last, attempts=attempts)
    if not last.retryable:
      return DcrRetryResult(result=last, attempts=attempts)
    # Retryable rejection (e.g. an OIDC redirect-URI / application-type constraint): flip the
    # application_type and try again. (R-23.15-f)
    application_type = "web" if application_type == "native" else "native"
  return DcrRetryResult(result=last, attempts=attempts)


# ─── §23.16 Credential binding to the issuer (R-23.16-a – R-23.16-g) ─────────────

@dataclass
class IssuerBoundCredentials:
  """Persisted client credentials bound to the issuing authorization server. (R-23.16-a)"""

  #: The issuing authorization server's ``issuer`` identifier; the storage key. (R-23.16-b)
  issuer: str
  #: The ``client_id`` issued by (or pre-registered with) that authorization server.
  client_id: str
  #: OPTIONAL ``client_secret`` for confidential clients.
  client_secret: str | None = None
  #: ``True`` when these credentials are a Client ID Metadata Document: a portable,
  #: self-hosted HTTPS-URL ``client_id`` with no per-issuer registration state, hence exempt
  #: from issuer re-binding/re-registration. (R-23.16, CIMD exemption)
  cimd: bool | None = None


#: The action a client takes for a discovered issuer: ``"reuse"`` | ``"re-register"`` |
#: ``"surface-error"``.
CredentialBindingAction = str


@dataclass(frozen=True)
class CredentialBindingDecision:
  """Outcome of :func:`decide_credential_binding`."""

  #: Whether to reuse the stored credentials, re-register, or surface an error.
  action: CredentialBindingAction
  #: Human-readable explanation, suitable for surfacing to a user/developer.
  reason: str


def issuers_match_exactly(a: str, b: str) -> bool:
  """Compare two ``issuer`` identifiers by EXACT string match, the comparison mandated for
  credential binding. No scheme/host case folding, default-port elision, trailing-slash, or
  percent-encoding normalization is applied. (R-23.16-f)
  """
  return a == b


def decide_credential_binding(
  *, stored: IssuerBoundCredentials | None, discovered_issuer: str, is_pre_registered: bool = False
) -> CredentialBindingDecision:
  """Decide whether a client may reuse stored credentials for the
  protected-resource-indicated authorization server, must re-register, or should surface an
  error. (R-23.16-c, R-23.16-d, R-23.16-e, R-23.16-f, R-23.16-g, CIMD exemption)

  Decision logic, all issuer comparisons by exact string match (R-23.16-f):
    - CIMD credentials are exempt: a portable HTTPS-URL ``client_id`` has no per-issuer state,
      so ``reuse`` regardless of issuer (CIMD exemption);
    - no stored credentials, or the stored ``issuer`` matches the discovered ``issuer`` →
      ``reuse`` (no stored ⇒ ``re-register``);
    - stored ``issuer`` differs from the discovered ``issuer``:
        - DCR-obtained (no ``cimd``, not flagged pre-registered) → ``re-register`` with the
          new authorization server (R-23.16-d, R-23.16-e);
        - pre-registered (``is_pre_registered: True``) → ``surface-error``, because
          pre-registered credentials cannot be re-registered automatically and the client
          SHOULD surface an error rather than silently using mismatched credentials
          (R-23.16-c, R-23.16-g).
  """
  if stored is None:
    return CredentialBindingDecision(
      action="re-register",
      reason="no credentials are stored for any issuer; register with the discovered authorization server (R-23.16-e)",
    )
  if stored.cimd is True:
    return CredentialBindingDecision(
      action="reuse",
      reason=(
        "CIMD credentials are a portable self-hosted HTTPS-URL client_id with no per-issuer "
        "state; reuse without re-registration (CIMD exemption)"
      ),
    )
  if issuers_match_exactly(stored.issuer, discovered_issuer):
    return CredentialBindingDecision(
      action="reuse",
      reason=f'stored issuer "{stored.issuer}" matches the discovered issuer; reuse credentials (R-23.16-a, R-23.16-f)',
    )
  # Issuer mismatch — MUST NOT reuse (R-23.16-c, R-23.16-d).
  if is_pre_registered is True:
    return CredentialBindingDecision(
      action="surface-error",
      reason=(
        f'pre-registered credentials are bound to "{stored.issuer}" but protected-resource '
        f'metadata indicates "{discovered_issuer}"; surface an error rather than silently using '
        f"mismatched credentials (R-23.16-c, R-23.16-d, R-23.16-g)"
      ),
    )
  return CredentialBindingDecision(
    action="re-register",
    reason=(
      f'credentials are bound to "{stored.issuer}" but the discovered issuer is '
      f'"{discovered_issuer}"; MUST NOT reuse, re-register with the new authorization server '
      f"(R-23.16-c, R-23.16-d, R-23.16-e)"
    ),
  )


class IssuerBoundCredentialStore:
  """An issuer-keyed store for persisted, issuer-bound client credentials, keeping separate
  registration state per authorization server. (R-23.16-a, R-23.16-b, R-23.17-d)

  The storage key is the authorization server's ``issuer`` identifier (R-23.16-b);
  :meth:`credentials_for` never returns another issuer's credentials, so a caller cannot reuse
  credentials across authorization servers (R-23.16-c). Distinct from S36's
  ``DynamicClientRegistrationStore`` (DCR-specific) and S35's ``CredentialStore`` (runtime
  tokens): this holds the persisted registration identity for ALL mechanisms (pre-registration
  and DCR), flagged with the CIMD exemption.
  """

  def __init__(self) -> None:
    self._by_issuer: dict[str, IssuerBoundCredentials] = {}

  def save(self, credentials: IssuerBoundCredentials) -> None:
    """Persist ``credentials``, keyed by their ``issuer``. (R-23.16-a, R-23.16-b)

    :raises ValueError: When ``credentials.issuer`` is empty — the key is REQUIRED.
    """
    if not credentials.issuer:
      raise ValueError(
        "credential storage key MUST be the authorization server issuer (R-23.16-b)"
      )
    self._by_issuer[credentials.issuer] = IssuerBoundCredentials(
      issuer=credentials.issuer,
      client_id=credentials.client_id,
      client_secret=credentials.client_secret,
      cimd=credentials.cimd,
    )

  def credentials_for(self, issuer: str) -> IssuerBoundCredentials | None:
    """Return the credentials stored for ``issuer``, or ``None``. Never another issuer's.
    (R-23.16-b, R-23.16-c)
    """
    found = self._by_issuer.get(issuer)
    if found is None:
      return None
    return IssuerBoundCredentials(
      issuer=found.issuer,
      client_id=found.client_id,
      client_secret=found.client_secret,
      cimd=found.cimd,
    )

  def has(self, issuer: str) -> bool:
    """Return ``True`` when credentials are stored for ``issuer``."""
    return issuer in self._by_issuer

  def decide_for(self, discovered_issuer: str, is_pre_registered: bool = False) -> CredentialBindingDecision:
    """Return the :class:`CredentialBindingDecision` for the credentials stored under
    ``discovered_issuer``, the convenience entry point combining lookup and
    :func:`decide_credential_binding`. (R-23.16-c – R-23.16-g)
    """
    return decide_credential_binding(
      stored=self.credentials_for(discovered_issuer),
      discovered_issuer=discovered_issuer,
      is_pre_registered=is_pre_registered,
    )


# ─── §23.17 Discovery robustness (R-23.17-a – R-23.17-i) ─────────────────────────

def protected_resource_metadata_uris(
  *, resource_metadata_url: str | None = None, mcp_endpoint_url: str | None = None
) -> list[str]:
  """Resolve the ordered protected-resource-metadata URIs to try, honouring the
  ``WWW-Authenticate`` ``resource_metadata`` precedence. (R-23.17-a, R-23.17-b)

    - When the ``401`` carried a ``resource_metadata`` URL, that single URL MUST be used
      (R-23.17-a);
    - otherwise the well-known URIs are returned in order — path-prefixed first, then host
      root — via S35's ``protected_resource_well_known_uris`` (R-23.17-b).
  """
  if resource_metadata_url is not None and resource_metadata_url != "":
    return [resource_metadata_url]
  if mcp_endpoint_url is None or mcp_endpoint_url == "":
    return []
  try:
    return protected_resource_well_known_uris(mcp_endpoint_url)
  except ValueError:
    return []


@dataclass(frozen=True)
class AuthorizationServersValidation:
  """Outcome of :func:`require_authorization_servers`."""

  ok: bool
  authorization_servers: list[str] | None = None
  reason: str | None = None


def require_authorization_servers(metadata: dict) -> AuthorizationServersValidation:
  """Validate that protected-resource metadata carries the REQUIRED ``authorization_servers``
  array of one or more issuer identifiers. (R-23.17-c)

  A valid document MUST contain ``authorization_servers`` with at least one entry; when more
  than one is listed, each is an independent authorization server the client selects among,
  maintaining separate registration state per AS (R-23.17-d, enforced by
  :class:`IssuerBoundCredentialStore`).
  """
  servers = metadata.get("authorization_servers")
  if not isinstance(servers, list) or len(servers) == 0:
    return AuthorizationServersValidation(
      ok=False,
      reason=(
        "protected-resource metadata MUST contain authorization_servers with one or more "
        "issuer identifiers (R-23.17-c)"
      ),
    )
  return AuthorizationServersValidation(ok=True, authorization_servers=list(servers))


def authorization_server_metadata_uris(issuer: str) -> list[str]:
  """Return the ordered authorization-server-metadata well-known URIs to try for ``issuer``,
  covering both OAuth 2.0 AS Metadata and OpenID Connect Discovery, for issuers with and
  without a path component. (R-23.17-e, R-23.17-f, R-23.17-g)

  A thin pass-through over S35's ``authorization_server_well_known_uris``, surfaced under the
  §23.17 atoms; returns the three path-component URIs (OAuth insertion, OIDC insertion, OIDC
  appending) for a path issuer and the two for a non-path issuer, in the mandated priority
  order.
  """
  return authorization_server_well_known_uris(issuer)


@dataclass(frozen=True)
class DiscoveredIssuerValidation:
  """Outcome of :func:`validate_discovered_issuer`."""

  ok: bool
  reason: str | None = None


def validate_discovered_issuer(document_issuer: str, expected_issuer: str) -> DiscoveredIssuerValidation:
  """Validate that a fetched authorization-server metadata document's ``issuer`` is IDENTICAL
  to the issuer used to construct the well-known URL; if it differs the document MUST NOT be
  used. (R-23.17-h, R-23.17-i)

  Exact string comparison — the same mix-up defence S35's
  ``validate_authorization_server_metadata`` performs; this surfaces just the issuer-identity
  check under the §23.17 atoms for callers that have already structurally validated the
  document.
  """
  if document_issuer != expected_issuer:
    return DiscoveredIssuerValidation(
      ok=False,
      reason=(
        f'fetched metadata issuer "{document_issuer}" does not match the expected issuer '
        f'"{expected_issuer}"; MUST NOT use the metadata (R-23.17-h, R-23.17-i)'
      ),
    )
  return DiscoveredIssuerValidation(ok=True)


# ─── §23.18 Scope selection & step-up authorization (R-23.18-a – R-23.18-r) ──────

def parse_scope_set(scope: str | None) -> list[str]:
  """Split a space-delimited scope string into a deduplicated, order-preserving list.
  Empty/whitespace-only input yields ``[]``.
  """
  if scope is None:
    return []
  seen: set[str] = set()
  out: list[str] = []
  for s in re.split(r"\s+", scope):
    if len(s) > 0 and s not in seen:
      seen.add(s)
      out.append(s)
  return out


def format_scope_set(scopes) -> str:
  """Serialize a scope list back into a space-delimited string."""
  return " ".join(scopes)


def select_initial_scopes(
  *, challenge=None, protected_resource: dict | None = None
) -> str | None:
  """Select the least-privilege scopes for the initial authorization handshake, applying the
  §23.18 priority: the ``WWW-Authenticate`` challenge ``scope`` (treated as authoritative,
  with no assumed relationship to ``scopes_supported``), else all of ``scopes_supported``,
  else omit the ``scope`` parameter entirely. (R-23.18-a, R-23.18-b, R-23.18-c, R-23.18-d)

  Delegates to S36's ``resolve_authorization_scope``, whose priority order is identical;
  surfaced here under the §23.18 atoms. Returns ``None`` to signal the ``scope`` parameter is
  omitted (R-23.18-d).
  """
  return resolve_authorization_scope(challenge=challenge, protected_resource=protected_resource)


def union_step_up_scopes(already_granted, challenged_scopes) -> list[str]:
  """Compute the UNION of already-granted/already-requested scopes with the newly-challenged
  scopes, the scope set a step-up re-authorization requests. (R-23.18-o, R-23.18-p, R-23.1-ae)

  Order-preserving and deduplicating: every already-granted scope is retained (R-23.18-p —
  never dropped) and the challenged scopes are appended. The result is the authoritative
  requested-scope set for the re-authorization. Hierarchically redundant scopes are NOT
  deduplicated semantically — the AS normalizes that during issuance (R-23.18-r).
  """
  seen: set[str] = set()
  out: list[str] = []
  for s in [*already_granted, *challenged_scopes]:
    if len(s) > 0 and s not in seen:
      seen.add(s)
      out.append(s)
  return out


#: Who the client is acting for, governing whether a step-up flow is attempted: ``"user"``
#: (SHOULD attempt step-up; R-23.18-m) or ``"client_credentials"`` (MAY attempt or abort;
#: R-23.18-n).
StepUpActor = str


def should_attempt_step_up(actor: StepUpActor) -> bool:
  """Return ``True`` when a client SHOULD attempt the step-up flow for a scope-related error:
  always for a user-acting client (R-23.18-m); for a ``client_credentials`` client it MAY
  attempt or abort, so this returns ``False`` (the conservative default — the caller MAY
  override). (R-23.18-l, R-23.18-m, R-23.18-n)
  """
  return actor == "user"


@dataclass(frozen=True)
class ScopeUpgradeKey:
  """A scope-upgrade attempt key: the resource-and-operation combination being upgraded.
  (R-23.18-r)
  """

  #: The MCP server's canonical resource identifier.
  resource: str
  #: The operation (e.g. the MCP method) being attempted.
  operation: str


#: The next action a step-up driver should take: ``"retry"`` | ``"permanent-failure"``.
StepUpAction = str


class ScopeUpgradeTracker:
  """Tracks bounded step-up retry attempts per resource-and-operation combination, so a client
  retries no more than a few times and treats persistent failure as a permanent authorization
  failure. (R-23.18-q, R-23.18-r, R-23.1-af, R-23.1-ag)

  Each :class:`ScopeUpgradeKey` accumulates an attempt count; once the bound is reached,
  :meth:`next_action` returns ``"permanent-failure"`` rather than ``"retry"``, implementing the
  retry limit (R-23.18-q) and the per-resource-and-operation attempt tracking that avoids
  repeated failures for the same combination (R-23.18-r, R-23.1-ag).
  """

  def __init__(self, max_attempts: int = 3) -> None:
    """:param max_attempts: The maximum number of step-up attempts per
      resource-and-operation; MUST be a few at most. Defaults to ``3``. (R-23.18-q)
    :raises ValueError: When ``max_attempts`` is not a positive integer.
    """
    if not isinstance(max_attempts, int) or isinstance(max_attempts, bool) or max_attempts < 1:
      raise ValueError("max_attempts MUST be a positive integer (a few at most) (R-23.18-q)")
    self._attempts: dict[str, int] = {}
    self._max_attempts = max_attempts

  @property
  def max_attempts(self) -> int:
    """The configured retry bound."""
    return self._max_attempts

  def _key_of(self, key: ScopeUpgradeKey) -> str:
    return f"{key.resource} {key.operation}"

  def attempts_for(self, key: ScopeUpgradeKey) -> int:
    """Return the number of step-up attempts recorded so far for ``key``. (R-23.1-ag)"""
    return self._attempts.get(self._key_of(key), 0)

  def can_retry(self, key: ScopeUpgradeKey) -> bool:
    """Return ``True`` when another step-up attempt is permitted for ``key`` (the bound has not
    been reached). (R-23.18-q)
    """
    return self.attempts_for(key) < self._max_attempts

  def record_attempt(self, key: ScopeUpgradeKey) -> int:
    """Record one step-up attempt for ``key`` and return the new attempt count. (R-23.1-ag)"""
    nxt = self.attempts_for(key) + 1
    self._attempts[self._key_of(key)] = nxt
    return nxt

  def next_action(self, key: ScopeUpgradeKey) -> StepUpAction:
    """Record an attempt for ``key`` and return whether to ``"retry"`` or treat the failure as
    a ``"permanent-failure"``, implementing the bounded retry. After the bound is reached,
    persistent failure MUST be treated as a permanent authorization failure. (R-23.18-q,
    R-23.1-af)
    """
    attempts = self.record_attempt(key)
    return "retry" if attempts <= self._max_attempts else "permanent-failure"

  def reset(self, key: ScopeUpgradeKey) -> None:
    """Clear the attempt count for ``key`` (e.g. after a successful retry)."""
    self._attempts.pop(self._key_of(key), None)


@dataclass(frozen=True)
class StepUpPlan:
  """A plan for one step-up re-authorization, from :func:`plan_step_up_authorization`."""

  #: Whether a step-up should be attempted at all (per the actor and retry bound).
  proceed: bool
  #: The UNION scope set to request on re-authorization, when ``proceed``. (R-23.18-o)
  scopes: list[str]
  #: The space-delimited ``scope`` parameter for the re-authorization request.
  scope: str
  #: When ``proceed`` is ``False``, why the step-up is not attempted.
  reason: str | None = None


def plan_step_up_authorization(
  *,
  actor: StepUpActor,
  already_granted,
  challenge,
  key: ScopeUpgradeKey,
  tracker: ScopeUpgradeTracker,
  force_for_client_credentials: bool = False,
) -> StepUpPlan:
  """Plan one step-up re-authorization end to end: decide whether to proceed (by actor and
  remaining retries), compute the UNION scope set that never drops already-granted scopes, and
  record the attempt against the bound. (R-23.18-l, R-23.18-m, R-23.18-n, R-23.18-o, R-23.18-p,
  R-23.18-q, R-23.18-r, R-23.1-ae, R-23.1-af, R-23.1-ag)

  Proceeds when (a) the actor SHOULD/elects to step up — a user-acting client, or a
  ``client_credentials`` client with ``force_for_client_credentials`` — AND (b) the tracker
  still permits a retry for the ``key``. When it proceeds it records the attempt (R-23.1-ag)
  and returns the unioned ``scopes``/``scope`` for a fresh authorization-code+PKCE flow (built
  with S36's ``build_authorization_request``). When the retry bound is exhausted it returns
  ``proceed=False`` so the caller treats the failure as permanent (R-23.18-q).
  """
  wants_step_up = should_attempt_step_up(actor) or force_for_client_credentials is True
  if not wants_step_up:
    return StepUpPlan(
      proceed=False,
      scopes=[],
      scope="",
      reason="a client_credentials client MAY abort rather than step up; not attempting (R-23.18-n)",
    )
  if not tracker.can_retry(key):
    return StepUpPlan(
      proceed=False,
      scopes=[],
      scope="",
      reason=(
        f"step-up retry bound ({tracker.max_attempts}) reached for this resource-and-operation; "
        f"treat as a permanent authorization failure (R-23.18-q, R-23.1-af)"
      ),
    )
  challenged = parse_scope_set(getattr(challenge, "scope", None))
  scopes = union_step_up_scopes(already_granted, challenged)
  tracker.record_attempt(key)
  return StepUpPlan(proceed=True, scopes=scopes, scope=format_scope_set(scopes))


# ─── §23.19 Authorization security considerations (R-23.19-a – R-23.19-u) ────────

@dataclass(frozen=True)
class ResourceBindingValidation:
  """Outcome of :func:`check_resource_parameter_binding`."""

  ok: bool
  reason: str | None = None


def check_resource_parameter_binding(
  *,
  authorization_request_resource: str | None = None,
  token_request_resource: str | None = None,
  canonical_resource: str,
) -> ResourceBindingValidation:
  """Validate the audience-binding requirement: the SAME ``resource`` parameter, identifying
  the MCP server by its canonical URI, MUST be present in BOTH the authorization request and
  the token request, regardless of advertised AS support. (R-23.19-a)

  A client MUST implement Resource Indicators by always sending ``resource`` in both legs
  (R-23.19-a). This confirms both are present and byte-identical to ``canonical_resource``;
  S36's ``assert_resource_matches_step2`` performs the equivalent Step-2/Step-4 invariant, and
  is reused by callers that already hold the request objects.
  """
  if authorization_request_resource != canonical_resource:
    return ResourceBindingValidation(
      ok=False,
      reason=(
        "the authorization request MUST send a resource parameter equal to the MCP server "
        "canonical URI, regardless of AS support (R-23.19-a)"
      ),
    )
  if token_request_resource != canonical_resource:
    return ResourceBindingValidation(
      ok=False,
      reason=(
        "the token request MUST send the same resource parameter as the authorization request "
        "(R-23.19-a)"
      ),
    )
  return ResourceBindingValidation(ok=True)


def may_forward_token_to_server(token_issuer: str, server_issuer: str) -> bool:
  """Return ``True`` when a client MAY send the access token it holds for ``token_issuer`` to
  the MCP server whose authorization server is ``server_issuer`` — strictly only when the
  issuers match exactly. A client MUST NOT send a token to an MCP server other than one issued
  by that server's authorization server. (R-23.19-c)
  """
  return issuers_match_exactly(token_issuer, server_issuer)


@dataclass(frozen=True)
class ExactIssuerValidation:
  """Outcome of :func:`validate_exact_issuer`, the §23.19 mix-up-defence check."""

  ok: bool
  reason: str | None = None


def validate_exact_issuer(
  *, iss: str | None = None, recorded_issuer: str, iss_parameter_supported: bool | None = None
) -> ExactIssuerValidation:
  """Validate the authorization response's ``iss`` against the recorded issuer by exact string
  comparison — the mix-up defence a client MUST perform BEFORE transmitting the authorization
  code, including the ``authorization_response_iss_parameter_supported`` reject rule.
  (R-23.19-e, R-23.19-f, R-23.19-g, R-23.19-h)

  Delegates to S36's ``validate_issuer`` (the §23.7 decision table); surfaced here under the
  §23.19 security atoms. The recorded issuer MUST have been captured before redirect
  (R-23.19-e) and stored with the PKCE verifier and ``state`` in the same per-request record
  (R-23.19-j, see :func:`same_request_record`). On failure the caller MUST NOT redeem the code
  or display the response's ``error``/details (R-23.19-i, S36's ``safe_authorization_error``).
  """
  result = validate_issuer(
    iss=iss, recorded_issuer=recorded_issuer, iss_parameter_supported=iss_parameter_supported
  )
  return ExactIssuerValidation(ok=True) if result.ok else ExactIssuerValidation(ok=False, reason=result.reason)


@dataclass
class SecureAuthorizationRequestRecord:
  """The per-request record that MUST hold the recorded issuer, PKCE code verifier, and
  ``state`` together. (R-23.19-e, R-23.19-j, R-23.19-k, R-23.19-l)

  Storing all three in one record is what lets the redirect handler validate ``iss`` (against
  ``recorded_issuer``), ``state``, and PKCE coherently. This mirrors S36's
  ``AuthorizationFlowRecord``; it is restated here as the §23.19 security invariant the
  consolidated check :func:`same_request_record` asserts.
  """

  #: The validated ``issuer``, recorded BEFORE redirect. (R-23.19-e)
  recorded_issuer: str | None = None
  #: The PKCE ``code_verifier``. (R-23.19-k)
  code_verifier: str | None = None
  #: The unpredictable anti-CSRF ``state``. (R-23.19-l)
  state: str | None = None


@dataclass(frozen=True)
class RequestRecordValidation:
  """Outcome of :func:`same_request_record`."""

  ok: bool
  reason: str | None = None


def same_request_record(record) -> RequestRecordValidation:
  """Assert that the recorded issuer, PKCE code verifier, and ``state`` are all present in the
  same per-request record, the §23.19 storage invariant. (R-23.19-j)

  All three MUST be co-located so the redirect can be validated coherently; an empty field
  means the record is incomplete and the flow MUST NOT proceed. ``record`` may be a
  :class:`SecureAuthorizationRequestRecord`, any object with those attributes, or a dict.
  """
  recorded_issuer = record.get("recorded_issuer") if isinstance(record, dict) else getattr(record, "recorded_issuer", None)
  code_verifier = record.get("code_verifier") if isinstance(record, dict) else getattr(record, "code_verifier", None)
  state = record.get("state") if isinstance(record, dict) else getattr(record, "state", None)
  if not recorded_issuer:
    return RequestRecordValidation(
      ok=False, reason="the recorded issuer MUST be stored in the per-request record (R-23.19-e, R-23.19-j)"
    )
  if not code_verifier:
    return RequestRecordValidation(
      ok=False, reason="the PKCE code_verifier MUST be stored in the same per-request record (R-23.19-j, R-23.19-k)"
    )
  if not state:
    return RequestRecordValidation(
      ok=False, reason="the state value MUST be stored in the same per-request record (R-23.19-j, R-23.19-l)"
    )
  return RequestRecordValidation(ok=True)


def is_confidential_token() -> bool:
  """Return ``True`` when a value MUST NOT be logged or forwarded because it is an access or
  refresh token — the token-confidentiality guard. Always ``True``: access and refresh tokens
  MUST NOT be logged and MUST NOT be forwarded to third parties. (R-23.19-m, R-23.19-n)

  Use to gate logging/forwarding sinks: ``if is_confidential_token(): skip_logging()``. It
  takes no token argument by design — the rule is unconditional, so it never incentivizes
  passing a token where it might be captured.
  """
  return True


def redact_token() -> str:
  """Return a redacted placeholder for a token so diagnostics never carry the secret itself,
  enforcing token confidentiality at log/forward sinks. (R-23.19-m, R-23.19-n, R-23.19-o)

  Access and refresh tokens MUST NOT be logged or forwarded; when a diagnostic must reference
  "the token", use this redaction instead of the value. Returns a fixed marker regardless of
  input, so the secret is never embedded.
  """
  return "[REDACTED]"


@dataclass(frozen=True)
class BearerHeaderValidation:
  """Outcome of :func:`check_bearer_header_only`."""

  ok: bool
  reason: str | None = None


def check_bearer_header_only(
  *, request_url: str, has_authorization_header: bool
) -> BearerHeaderValidation:
  """Validate that the access token is presented ONLY in the ``Authorization: Bearer`` request
  header and NEVER in the URI query string. (R-23.19-p)

  Reuses S36's ``url_contains_access_token_in_query`` to reject a request URL that smuggles
  ``access_token`` in the query, and requires an ``Authorization`` header to be present (the
  token's only permitted location).
  """
  if url_contains_access_token_in_query(request_url):
    return BearerHeaderValidation(
      ok=False,
      reason=(
        "the access token MUST NOT be placed in the URI query string; send it only in the "
        "Authorization: Bearer header (R-23.19-p)"
      ),
    )
  if not has_authorization_header:
    return BearerHeaderValidation(
      ok=False,
      reason=(
        "the access token MUST be sent in the Authorization: Bearer header on every request to "
        "the MCP server (R-23.19-p)"
      ),
    )
  return BearerHeaderValidation(ok=True)


# ─── §23.19 Refresh tokens (R-23.19-q – R-23.19-u) ───────────────────────────────

def grant_types_with_refresh(grant_types) -> list[str]:
  """Return the ``grant_types`` a client wanting refresh tokens SHOULD register: the given
  grant types plus ``refresh_token`` (deduplicated). (R-23.19-r)

  A client that wants refresh tokens SHOULD include ``refresh_token`` in its ``grant_types``
  client metadata; this ensures it is present without duplicating it.
  """
  out = list(grant_types)
  if GRANT_TYPE_REFRESH_TOKEN not in out:
    out.append(GRANT_TYPE_REFRESH_TOKEN)
  return out


def with_offline_access_if_advertised(scopes, authorization_server_meta: dict) -> list[str]:
  """Add ``offline_access`` to a ``scope`` list when, and only when, the authorization-server
  metadata advertises it in ``scopes_supported``, for a client that wants a refresh token.
  (R-23.19-s)

  A client MAY add ``offline_access`` only when the AS lists it; when it is not advertised the
  scope is returned unchanged. The result is deduplicated. Mirrors S36's
  ``with_offline_access_scope`` behaviour under the §23.19 refresh atom; provided as a
  list-shaped helper for the scope-list call sites in this story.
  """
  advertised = OFFLINE_ACCESS_SCOPE in (authorization_server_meta.get("scopes_supported") or [])
  out = list(scopes)
  if advertised and OFFLINE_ACCESS_SCOPE not in out:
    out.append(OFFLINE_ACCESS_SCOPE)
  return out


def refresh_token_is_never_assumed() -> bool:
  """Return ``True`` — a client MUST NOT assume a refresh token will be issued; the
  authorization server retains discretion. (R-23.19-t)

  A guard for control flow: treat the refresh token as optional and handle its absence. Pair
  with S36's ``has_no_refresh_token`` to detect a token response that did not issue one.
  """
  return True


@dataclass(frozen=True)
class OfflineAccessOmissionValidation:
  """Outcome of :func:`server_scopes_omit_offline_access`."""

  ok: bool
  reason: str | None = None


def server_scopes_omit_offline_access(
  *, challenge_scope: str | None = None, scopes_supported=None
) -> OfflineAccessOmissionValidation:
  """Validate that a server (protected resource) does NOT include ``offline_access`` in its
  ``WWW-Authenticate`` ``scope`` or in its ``scopes_supported``, as a server SHOULD ensure —
  refresh tokens are not a resource requirement. (R-23.19-u)
  """
  if challenge_scope is not None and OFFLINE_ACCESS_SCOPE in parse_scope_set(challenge_scope):
    return OfflineAccessOmissionValidation(
      ok=False,
      reason="a server SHOULD NOT include offline_access in its WWW-Authenticate scope (R-23.19-u)",
    )
  if scopes_supported is not None and OFFLINE_ACCESS_SCOPE in scopes_supported:
    return OfflineAccessOmissionValidation(
      ok=False,
      reason="a server SHOULD NOT include offline_access in its scopes_supported (R-23.19-u)",
    )
  return OfflineAccessOmissionValidation(ok=True)
