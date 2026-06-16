"""OAuth 2.1 client flow (§23): an edge-friendly helper that produces an
:class:`AuthProvider` for the Streamable HTTP client transport.

This mirrors the TS SDK's ``client/oauth.ts``. It covers the full client side of the
MCP authorization handshake for an HTTP-based transport:

  - PKCE (``S256``) verifier/challenge generation (§23.5) and the support gate a client
    MUST apply before proceeding (§28.5, R-28.5-k);
  - protected-resource → authorization-server metadata discovery, path-aware per RFC
    9728 §3.1 / RFC 8414 §3.1 / OIDC Discovery with root fallbacks, plus the mix-up
    issuer-match defense (§23.2, §23.3, §23.17);
  - dynamic client registration (RFC 7591), with the REQUIRED ``application_type``
    (§23.4, §23.14, §23.15);
  - the authorization-request URL builder with PKCE and the RFC 8707 ``resource``
    audience binding (§23.5, §23.6);
  - the redirect verifier — CSRF ``state`` and, when advertised, mix-up ``iss`` (§23.5,
    §23.7);
  - the authorization-code token exchange and the refresh-token grant, both audience-bound
    via ``resource`` (§23.5, §23.6, §23.9);
  - :func:`create_auth_provider`, which wraps a token response as the per-request bearer
    source the transport calls, refreshing transparently shortly before expiry (§23.8).

The interactive consent step is the caller's: build the authorize URL with
:func:`build_authorize_url`, redirect the user, capture the returned ``code`` and
``state``/``iss``, verify with :func:`verify_authorization_redirect`, then call
:func:`exchange_authorization_code`.

The HTTP client is injectable for testing via the ``fetch`` parameter; the default uses
``httpx`` (the same dependency :mod:`mcp.client.http` relies on), imported lazily so the
pure helpers carry no import-time network dependency. Only the pure metadata schema from
:mod:`mcp.protocol.authorization` is reused.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable
from urllib.parse import urlsplit, urlunsplit

from mcp.protocol.authorization import is_authorization_server_metadata

#: The PKCE challenge method MCP REQUIRES; the only value MCP permits. (§23.5)
PKCE_METHOD = "S256"


# ─── Base64url ───────────────────────────────────────────────────────────────────

def _base64url(data: bytes) -> str:
  """Base64url-encode bytes without padding (PKCE / token encoding)."""
  return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


# ─── PKCE (§23.5, §28.5) ───────────────────────────────────────────────────────────

#: The shape of a PKCE verifier/challenge pair (§23.5): a plain ``dict`` with the keys
#: ``code_verifier``, ``code_challenge``, and ``code_challenge_method`` (always ``S256``).
#: A ``dict`` (not a dataclass) so callers subscript it like the TS object's fields.
PkcePair = dict


def create_pkce_pair() -> dict:
  """Generate a PKCE ``S256`` verifier/challenge pair as a ``dict``. (§23.5)

  Returns ``{code_verifier, code_challenge, code_challenge_method}``. The verifier is 32
  cryptographically random bytes, base64url-encoded; the challenge is
  ``BASE64URL(SHA-256(code_verifier))`` per RFC 7636. Mirrors the TS ``createPkcePair``
  (whose object carries the same three fields).
  """
  verifier = _base64url(secrets.token_bytes(32))
  digest = hashlib.sha256(verifier.encode("ascii")).digest()
  return {
    "code_verifier": verifier,
    "code_challenge": _base64url(digest),
    "code_challenge_method": PKCE_METHOD,
  }


def assert_pkce_supported(metadata: dict) -> None:
  """Confirm the authorization server advertises PKCE ``S256``; raise otherwise. (§28.5,
  R-28.5-k)

  A client MUST verify, via authorization-server metadata, that the server supports the
  ``S256`` challenge method before proceeding; if support cannot be confirmed the client
  MUST refuse to proceed. This inspects ``code_challenge_methods_supported``.

  :raises ValueError: when ``S256`` is not advertised.
  """
  methods = metadata.get("code_challenge_methods_supported")
  if not methods or PKCE_METHOD not in methods:
    raise ValueError(
      "Authorization server does not confirm PKCE S256 support; refusing to proceed (R-28.5-k)"
    )


# ─── Injectable fetch (parity with the TS `fetch?` injection point) ────────────────

@runtime_checkable
class FetchJsonResponse(Protocol):
  """The minimal HTTP response surface the OAuth flow consumes.

  Satisfied by ``httpx.Response`` (``status_code`` → :attr:`ok`/:attr:`status`,
  ``json()``); a test fetcher need only supply an ``ok`` flag, a ``status`` int, and a
  ``json()`` method. Mirrors the TS SDK's reliance on the Web ``Response`` (``ok``,
  ``status``, ``json()``).
  """

  @property
  def ok(self) -> bool: ...

  @property
  def status(self) -> int: ...

  def json(self) -> Any: ...


#: A ``fetch`` callable: takes a URL and an OPTIONAL request init (``method``/``headers``/
#: ``body``), returns a :class:`FetchJsonResponse`. Mirrors the TS SDK's ``typeof fetch``
#: injection point so a test can drive discovery, registration, and the token endpoints
#: without a real network.
Fetch = Callable[..., FetchJsonResponse]


class _HttpxJsonResponse:
  """Adapts an ``httpx.Response`` to the :class:`FetchJsonResponse` surface (``ok``,
  ``status``, ``json()``)."""

  def __init__(self, response: Any) -> None:
    self._response = response

  @property
  def ok(self) -> bool:
    return 200 <= self._response.status_code < 300

  @property
  def status(self) -> int:
    return int(self._response.status_code)

  def json(self) -> Any:
    return self._response.json()


def _default_fetch(url: str, init: dict | None = None) -> FetchJsonResponse:
  """The default ``fetch`` implementation, backed by ``httpx``.

  Honors an OPTIONAL ``init`` mapping mirroring the Web Fetch ``RequestInit``: ``method``
  (defaults to ``GET``), ``headers``, and a ``body`` that is either a JSON string or a
  ``dict``/sequence of form pairs. Imported lazily so the synchronous helpers carry no
  import-time network dependency.
  """
  import httpx

  init = init or {}
  method = init.get("method", "GET")
  headers = init.get("headers")
  body = init.get("body")
  with httpx.Client(timeout=httpx.Timeout(30.0)) as client:
    response = client.request(method, url, headers=headers, content=body)
  return _HttpxJsonResponse(response)


def _resolve_fetch(fetch: Fetch | None) -> Fetch:
  """Return the caller-supplied ``fetch`` or the lazy httpx default."""
  return fetch if fetch is not None else _default_fetch


def _fetch_json(fetcher: Fetch, url: str, init: dict | None = None) -> Any:
  """Invoke ``fetcher`` and decode the JSON body, raising on a non-2xx status.

  Tolerates a fetcher that accepts only the URL (``init`` is passed only when given) so a
  one-argument test fetcher and a two-argument one both work.
  """
  response = fetcher(url) if init is None else fetcher(url, init)
  if not response.ok:
    raise ValueError(f"HTTP {response.status} from {url}")
  return response.json()


def _fetch_first_json(fetcher: Fetch, urls: list[str]) -> Any:
  """Fetch the first URL that returns a 2xx JSON body; raise if none do. (§23.17)

  Mirrors the TS SDK's ``fetchFirstJson``: each candidate is tried in order, a non-2xx
  response or a raised error is recorded, and the first success wins. The aggregate error
  names the last failure.
  """
  last_err: Exception | None = None
  for url in urls:
    try:
      response = fetcher(url)
      if response.ok:
        return response.json()
      last_err = ValueError(f"HTTP {response.status} from {url}")
    except Exception as exc:  # noqa: BLE001 — mirror TS: any fetch failure is recorded, not fatal.
      last_err = exc
  detail = str(last_err) if last_err is not None else "no candidate URLs"
  raise ValueError(f"authorization server metadata discovery failed: {detail}")


# ─── Discovery URL construction (§23.17) ───────────────────────────────────────────

def _origin(url: str) -> str:
  """Return the ``scheme://host[:port]`` origin of an absolute URL (host preserved)."""
  parts = urlsplit(url)
  return f"{parts.scheme}://{parts.netloc}"


def _strip_trailing_slashes(value: str) -> str:
  """Strip every trailing ``/`` from a string (``re.sub(r'/+$', '', …)`` equivalent)."""
  return value.rstrip("/")


def protected_resource_metadata_urls(resource: str) -> list[str]:
  """Protected-resource metadata URLs for ``resource``, path-aware (RFC 9728 §3.1) with a
  root fallback. (§23.2, §23.17)

  Order:
    1. the well-known suffix prefixed to the endpoint's path —
       ``https://<host>/.well-known/oauth-protected-resource<path>``;
    2. the suffix at the host root (only when the endpoint has a path).
  """
  host = _origin(resource)
  path = _strip_trailing_slashes(urlsplit(resource).path)
  urls = [f"{host}/.well-known/oauth-protected-resource{path}"]
  if path:
    urls.append(f"{host}/.well-known/oauth-protected-resource")
  return urls


def discovery_urls(issuer: str) -> list[str]:
  """The ordered authorization-server metadata URLs to try for ``issuer``, path-aware per
  RFC 8414 §3.1 / OIDC Discovery, with root-level fallbacks for a path-component issuer.
  (§23.3, §23.17)

  For a root issuer (no path): the OAuth AS well-known then OIDC discovery. For a
  path-component issuer: the OAuth AS well-known (path-inserted), OIDC discovery
  (path-appended to the issuer), then the OAuth AS and OIDC roots as fallbacks.
  """
  host = _origin(issuer)
  path = _strip_trailing_slashes(urlsplit(issuer).path)  # "" for a root issuer
  trimmed_issuer = _strip_trailing_slashes(issuer)
  urls = [
    f"{host}/.well-known/oauth-authorization-server{path}",
    f"{trimmed_issuer}/.well-known/openid-configuration",
  ]
  if path:
    urls.append(f"{host}/.well-known/oauth-authorization-server")
    urls.append(f"{host}/.well-known/openid-configuration")
  return urls


def _issuers_equal(a: str, b: str) -> bool:
  """Compare two issuer identifiers, tolerating only a trailing-slash difference.

  Mirrors the TS SDK's ``issuersEqual``: this is the discovery-time tolerance applied
  before the metadata's ``issuer`` is bound; the §23.7 redirect ``iss`` check elsewhere is
  exact (no normalization).
  """
  return _strip_trailing_slashes(a) == _strip_trailing_slashes(b)


# ─── Metadata discovery (§23.2–§23.3, §23.17) ──────────────────────────────────────

#: The shape of discovered OAuth metadata for a protected MCP resource: a plain ``dict``
#: with ``issuer``, ``authorization_server``, and ``protected_resource``. A ``dict`` (not a
#: dataclass) so callers subscript it like the TS object's fields.
DiscoveredOAuthMetadata = dict


def discover_oauth_metadata(
  *,
  resource: str,
  resource_metadata_url: str | None = None,
  fetch: Fetch | None = None,
) -> dict:
  """Discover protected-resource metadata (RFC 9728) then authorization-server metadata
  (RFC 8414). (§23.2–§23.3, §23.17)

  The protected-resource document is fetched path-aware with a root fallback, unless
  ``resource_metadata_url`` is given (e.g. from a ``401``'s ``WWW-Authenticate``
  ``resource_metadata``), which overrides discovery. The first listed
  ``authorization_servers`` entry is selected, its metadata fetched across the ordered
  discovery URLs, validated against the §23.3 schema, and its ``issuer`` checked to match
  the issuer the discovery URL was built from (mix-up defense, RFC 8414 §3.3 / §23.3).

  :raises ValueError: when the protected-resource document lists no authorization servers,
    when the authorization-server metadata is structurally invalid, or when its ``issuer``
    does not match the selected issuer (possible mix-up attack).
  """
  fetcher = _resolve_fetch(fetch)
  if resource_metadata_url:
    prm = _fetch_json(fetcher, resource_metadata_url)
  else:
    prm = _fetch_first_json(fetcher, protected_resource_metadata_urls(resource))

  servers = prm.get("authorization_servers") if isinstance(prm, dict) else None
  issuer = servers[0] if servers else None
  if not issuer:
    raise ValueError("protected-resource metadata lists no authorization_servers")

  as_json = _fetch_first_json(fetcher, discovery_urls(issuer))
  if not is_authorization_server_metadata(as_json):
    raise ValueError(
      "authorization server metadata is not a valid AuthorizationServerMetadata document "
      "(§23.3)"
    )

  # Mix-up defense (§23.3, RFC 8414 §3.3): the metadata `issuer` MUST identify the same
  # authorization server the discovery URL was built from.
  if not _issuers_equal(as_json["issuer"], issuer):
    raise ValueError(
      f'authorization server metadata issuer "{as_json["issuer"]}" does not match '
      f'"{issuer}" (possible mix-up attack; §23.3)'
    )
  return {
    "issuer": issuer,
    "authorization_server": dict(as_json),
    "protected_resource": dict(prm),
  }


# ─── Redirect verification (§23.5, §23.7) ──────────────────────────────────────────

def verify_authorization_redirect(
  *,
  sent_state: str,
  returned_state: str | None = None,
  issuer: str,
  returned_iss: str | None = None,
  iss_parameter_supported: bool = False,
) -> None:
  """Verify the authorization redirect before redeeming the code. (§23.5, §23.7)

  The returned ``state`` MUST equal the value sent in step 1 (CSRF defense). When the
  authorization server advertises ``authorization_response_iss_parameter_supported``, the
  redirect MUST carry an ``iss`` and it MUST exactly equal the recorded ``issuer`` (mix-up
  defense). The ``iss`` comparison is an exact string match — no scheme/host case folding,
  default-port elision, trailing-slash, or percent-encoding normalization (§23.7).

  :raises ValueError: on a ``state`` mismatch, a missing ``iss`` when the parameter is
    advertised, or an ``iss`` mismatch.
  """
  if sent_state != returned_state:
    raise ValueError(
      "OAuth redirect `state` mismatch — possible CSRF; refusing to redeem the code (§23.5)"
    )
  if iss_parameter_supported:
    if returned_iss is None:
      raise ValueError(
        "AS advertises the iss parameter but the redirect carried no `iss` (§23.7)"
      )
    if returned_iss != issuer:
      raise ValueError(
        f'OAuth redirect `iss` "{returned_iss}" != issuer "{issuer}" — possible mix-up (§23.7)'
      )


# ─── Dynamic client registration (RFC 7591, §23.4/§23.14/§23.15) ───────────────────

#: The shape of a dynamic-registration result: a plain ``dict`` carrying the camelCase
#: ``clientId`` plus the full authorization-server response (so ``client_id`` and any
#: ``client_secret`` remain accessible). A ``dict`` (not a dataclass) so callers subscript
#: it like the TS object's fields.
RegisteredClient = dict


def register_client(
  metadata: dict,
  *,
  client_name: str,
  redirect_uris: list[str] | None = None,
  grant_types: list[str] | None = None,
  application_type: str = "web",
  fetch: Fetch | None = None,
) -> dict:
  """Dynamically register a client at the authorization server. (RFC 7591, §23.4, §23.14,
  §23.15)

  POSTs a registration request to the ``registration_endpoint`` carrying ``client_name``,
  the REQUIRED ``application_type`` (defaults to ``"web"``; ``"native"`` for loopback
  clients — §23.15, SEP-837), ``grant_types`` (defaults to ``["authorization_code"]``),
  and ``redirect_uris`` when supplied. Returns a ``dict`` of the full authorization-server
  response with an added camelCase ``clientId`` alias (parity with the TS ``{ clientId,
  clientSecret }``); ``client_id`` / ``client_secret`` are preserved from the response.

  :raises ValueError: when the authorization server advertises no ``registration_endpoint``.
  """
  endpoint = metadata.get("registration_endpoint")
  if not endpoint:
    raise ValueError("authorization server has no registration_endpoint")
  fetcher = _resolve_fetch(fetch)
  body: dict[str, object] = {
    "client_name": client_name,
    "application_type": application_type,  # REQUIRED (§23.15)
    "grant_types": grant_types if grant_types is not None else ["authorization_code"],
  }
  if redirect_uris is not None:
    body["redirect_uris"] = redirect_uris
  import json as _json

  json = _fetch_json(
    fetcher,
    endpoint,
    {
      "method": "POST",
      "headers": {"content-type": "application/json"},
      "body": _json.dumps(body),
    },
  )
  return {"clientId": json.get("client_id"), **json}


# ─── Authorization-request URL (§23.5, §23.6) ──────────────────────────────────────

def build_authorize_url(
  metadata: dict,
  *,
  client_id: str,
  redirect_uri: str,
  resource: str,
  state: str,
  code_challenge: str,
  scope: str | None = None,
) -> str:
  """Build the authorization-request URL (``response_type=code`` + PKCE). (§23.5, §23.6)

  Sets ``response_type=code``, ``client_id``, ``redirect_uri``, the OPTIONAL ``scope``,
  ``state``, the PKCE ``code_challenge`` + ``code_challenge_method=S256``, and the RFC 8707
  ``resource`` audience binding (MUST be included regardless of AS support — §23.6). Query
  parameters are merged onto any already present on the ``authorization_endpoint``.
  """
  endpoint = metadata.get("authorization_endpoint")
  if not endpoint:
    raise ValueError("authorization server metadata has no authorization_endpoint")
  parts = urlsplit(endpoint)
  params = _parse_query(parts.query)
  _set(params, "response_type", "code")
  _set(params, "client_id", client_id)
  _set(params, "redirect_uri", redirect_uri)
  _set(params, "scope", scope)
  _set(params, "state", state)
  _set(params, "code_challenge", code_challenge)
  _set(params, "code_challenge_method", PKCE_METHOD)
  _set(params, "resource", resource)  # audience binding (§23.6)
  return urlunsplit(
    (parts.scheme, parts.netloc, parts.path, _encode_query(params), parts.fragment)
  )


# ─── Token endpoint (§23.5, §23.9) ─────────────────────────────────────────────────

#: The shape of a token-endpoint response (§23.5): a plain ``dict`` with ``access_token``
#: and ``token_type`` (§23.8) and the OPTIONAL ``expires_in``, ``refresh_token`` (§23.9),
#: and ``scope``. A ``dict`` (not a dataclass) so callers subscript / ``.get`` it like the
#: TS ``OAuthTokenResponse`` interface.
OAuthTokenResponse = dict


def _post_token(metadata: dict, body: dict[str, str], fetcher: Fetch) -> dict:
  """POST an ``application/x-www-form-urlencoded`` token request and decode the response.

  :raises ValueError: when the AS metadata has no ``token_endpoint`` or the endpoint
    returns a non-2xx status.
  """
  endpoint = metadata.get("token_endpoint")
  if not endpoint:
    raise ValueError("authorization server metadata has no token_endpoint")
  response = fetcher(
    endpoint,
    {
      "method": "POST",
      "headers": {"content-type": "application/x-www-form-urlencoded"},
      "body": _encode_query(body),
    },
  )
  if not response.ok:
    raise ValueError(f"token endpoint returned HTTP {response.status}")
  return response.json()


def exchange_authorization_code(
  metadata: dict,
  *,
  client_id: str,
  code: str,
  code_verifier: str,
  redirect_uri: str,
  resource: str,
  client_secret: str | None = None,
  fetch: Fetch | None = None,
) -> dict:
  """Exchange an authorization code (+ PKCE verifier) for tokens. (§23.5)

  The RFC 8707 ``resource`` parameter is REQUIRED so the issued token is audience-bound to
  this MCP server (§23.6) and MUST be identical to the value sent in the authorization
  request. ``client_secret`` is sent only when supplied (confidential clients).
  """
  body = {
    "grant_type": "authorization_code",
    "code": code,
    "code_verifier": code_verifier,
    "redirect_uri": redirect_uri,
    "client_id": client_id,
    "resource": resource,  # RFC 8707 audience binding — REQUIRED (§23.6)
  }
  if client_secret:
    body["client_secret"] = client_secret
  return _post_token(metadata, body, _resolve_fetch(fetch))


def refresh_access_token(
  metadata: dict,
  *,
  client_id: str,
  refresh_token: str,
  resource: str,
  client_secret: str | None = None,
  fetch: Fetch | None = None,
) -> dict:
  """Redeem a refresh token for a fresh access token. (§23.9)

  The ``resource`` parameter is REQUIRED on refresh too, so the new token keeps the same
  audience binding as the original (§23.9). ``client_secret`` is sent only when supplied.
  """
  body = {
    "grant_type": "refresh_token",
    "refresh_token": refresh_token,
    "client_id": client_id,
    "resource": resource,  # keep the audience binding on refresh (§23.9)
  }
  if client_secret:
    body["client_secret"] = client_secret
  return _post_token(metadata, body, _resolve_fetch(fetch))


# ─── AuthProvider (§23.8) ──────────────────────────────────────────────────────────

#: A ``refresh`` callback: takes the current refresh token, returns a fresh token-response
#: ``dict``. May be synchronous or return an awaitable (parity with the TS async callback).
RefreshCallback = Callable[[str], "dict | Awaitable[dict]"]


def _token_expiry_ms(token: dict, now_ms: float) -> float:
  """The absolute expiry instant in ms for a token-response ``dict``: ``now + expires_in*1000``,
  or ``+inf`` when the response carried no ``expires_in``."""
  expires_in = token.get("expires_in")
  return now_ms + expires_in * 1000 if expires_in else float("inf")


class AuthProvider:
  """Supplies a bearer token for the protected-resource flow, refreshing transparently
  shortly before expiry. (§23.8)

  The MCP Streamable HTTP client transport calls :meth:`token` fresh on every POST so a
  rotating token is always current. When a ``refresh`` callback was supplied, a token with
  a refresh token is renewed once it is within ``skew_ms`` of expiry.
  """

  def __init__(
    self,
    initial: dict,
    refresh: RefreshCallback | None,
    now: Callable[[], float],
    skew_ms: float,
  ) -> None:
    self._current = initial
    self._refresh = refresh
    self._now = now
    self._skew_ms = skew_ms
    self._expires_at_ms = _token_expiry_ms(initial, now())

  def token(self) -> str | None:
    """Return the access token to attach as ``Authorization: Bearer <token>``, refreshing
    first when within ``skew_ms`` of expiry and a refresh token + callback are available.
    """
    if (
      self._refresh is not None
      and self._current.get("refresh_token")
      and self._now() + self._skew_ms >= self._expires_at_ms
    ):
      result = self._refresh(self._current["refresh_token"])
      if not isinstance(result, dict):
        # An awaitable was returned (parity with the TS async refresh): resolve it.
        result = _resolve_awaitable(result)
      self._current = result
      self._expires_at_ms = _token_expiry_ms(result, self._now())
    return self._current.get("access_token")


def _resolve_awaitable(value: Any) -> dict:
  """Drive an awaitable refresh result to completion on a private event loop.

  Lets a caller supply an ``async`` refresh callback while keeping :meth:`AuthProvider.token`
  synchronous, mirroring the TS provider that ``await``\\ s the refresh.
  """
  import asyncio

  return asyncio.new_event_loop().run_until_complete(value)


def create_auth_provider(
  initial: dict,
  refresh: RefreshCallback | None = None,
  *,
  now: Callable[[], float] | None = None,
  skew_ms: float = 30_000.0,
) -> AuthProvider:
  """Wrap a token-response ``dict`` as an :class:`AuthProvider`, transparently refreshing
  shortly before expiry when a ``refresh`` callback is supplied. (§23.8)

  ``now`` returns the current time in milliseconds (defaults to the wall clock); ``skew_ms``
  is how far before expiry a proactive refresh fires (defaults to 30s). The returned
  provider is what the Streamable HTTP client transport calls per request.
  """
  clock = now if now is not None else (lambda: time.time() * 1000)
  return AuthProvider(initial=initial, refresh=refresh, now=clock, skew_ms=skew_ms)


# ─── Query-string helpers (URL/Web-platform parity) ────────────────────────────────

def _parse_query(query: str) -> list[tuple[str, str]]:
  """Parse a URL query string into ordered ``(key, value)`` pairs, preserving order and
  duplicates (matches ``URLSearchParams`` over an existing endpoint query)."""
  from urllib.parse import parse_qsl

  return parse_qsl(query, keep_blank_values=True)


def _set(params: list[tuple[str, str]], key: str, value: str | None) -> None:
  """Set ``key`` to ``value`` in ``params`` (replacing any existing entry), skipping a
  ``None`` value — mirrors the TS ``set`` that only assigns defined values."""
  if value is None:
    return
  for index, (existing, _existing_value) in enumerate(params):
    if existing == key:
      params[index] = (key, value)
      return
  params.append((key, value))


def _encode_query(params: list[tuple[str, str]] | dict[str, str]) -> str:
  """URL-encode ordered ``(key, value)`` pairs (or a mapping) into a query string,
  matching ``URLSearchParams`` (``application/x-www-form-urlencoded``) serialization."""
  from urllib.parse import urlencode

  pairs = list(params.items()) if isinstance(params, dict) else params
  return urlencode(pairs)
