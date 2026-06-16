"""``Icon`` / ``Icons`` types with security validation (§14.2).

``Icon`` describes a single renderable icon image; ``Icons`` contributes an OPTIONAL
``icons`` array to identity/descriptor objects.

Security model (§14.2): only ``https:`` URLs and ``data:`` URIs are accepted (R-14.2-o);
unsafe schemes are rejected (R-14.2-n); MIME type is detected from magic bytes, not the
declared type (R-14.2-s); only allowlisted image types render (R-14.2-u).

The secure network fetch (:func:`fetch_icon`, the TS SDK's ``fetchIcon``) follows the
same rules: it manually handles redirects, refusing any scheme change or cross-origin
hop (R-14.2-p), and sends a credential-free request (R-14.2-q). The HTTP client is
injectable for testing via the ``fetch`` parameter; the default uses ``httpx`` (the
same dependency :mod:`mcp.client.http` relies on).
"""

from __future__ import annotations

import base64
import binascii
import re
import urllib.parse
from dataclasses import dataclass
from typing import Annotated, Callable, Literal, Protocol, runtime_checkable

from pydantic import AfterValidator

from mcp._model import McpModel, validates

#: Background theme an icon targets (§14.2) — the closed set, as a field type.
IconTheme = Literal["light", "dark"]

#: Background themes an icon may target (§14.2). Closed set.
ICON_THEMES = frozenset({"light", "dark"})

# Each size entry is "WxH" or "any" (for scalable). (R-14.2-h) — fullmatch so a trailing
# newline cannot sneak past, matching JS's `$` (which, unlike Python's, never does).
_SIZES_RE = re.compile(r"\d+x\d+|any")


def _require_icon_size(value: str) -> str:
  """Field validator: reject an icon ``sizes`` entry that is not ``"WxH"`` or ``"any"``."""
  if not _SIZES_RE.fullmatch(value):
    raise ValueError('icon size MUST be "WxH" or "any" (R-14.2-h)')
  return value


#: An icon size string — the analogue of Zod ``z.string().regex(/^\d+x\d+$|^any$/)``.
IconSize = Annotated[str, AfterValidator(_require_icon_size)]


class Icon(McpModel):
  """A single renderable icon image (§14.2) — the Python analogue of the TS ``IconSchema``.

  ``src`` is REQUIRED; all other fields are OPTIONAL. ``theme`` is a closed enum; unknown
  members pass through (forward-compatible).
  """

  #: REQUIRED. URI pointing to the icon resource (https: URL or data: URI). (R-14.2-c)
  src: str
  #: OPTIONAL. MIME-type override when the source type is missing or generic. (R-14.2-g)
  mime_type: str | None = None
  #: OPTIONAL. Intended-use sizes; each entry is ``"WxH"`` or ``"any"``. (R-14.2-h, R-14.2-i)
  sizes: list[IconSize] | None = None
  #: OPTIONAL. Background theme the icon is designed for. (R-14.2-j, R-14.2-k)
  theme: IconTheme | None = None


class Icons(McpModel):
  """The ``Icons`` mixin — contributes the OPTIONAL ``icons`` array. (R-14.2-b, R-14.2-v)"""

  #: OPTIONAL. A set of sized icons a consumer MAY display. Absent ⇒ none advertised.
  icons: list[Icon] | None = None


def is_valid_icon(value: object) -> bool:
  """Return ``True`` for a valid ``Icon`` (§14.2): REQUIRED string ``src``; OPTIONAL
  ``mimeType`` (str), ``sizes`` (list of ``"WxH"``/``"any"``), ``theme`` (light/dark).
  Extra members tolerated.
  """
  return validates(Icon, value)


def is_valid_icons(value: object) -> bool:
  """Return ``True`` for a valid ``Icons`` mixin (§14.2): an object with an OPTIONAL
  ``icons`` array of valid :class:`Icon` entries. An absent or empty array is valid;
  extra members are tolerated. (R-14.2-b, R-14.2-v)
  """
  return validates(Icons, value)


#: MIME types a consumer MUST support when rendering icons. (R-14.2-l)
REQUIRED_IMAGE_TYPES = frozenset({"image/png", "image/jpeg", "image/jpg"})
#: MIME types a consumer SHOULD additionally support. (R-14.2-m)
RECOMMENDED_IMAGE_TYPES = frozenset({"image/svg+xml", "image/webp"})
#: Default allowlist: REQUIRED + RECOMMENDED. (R-14.2-u)
DEFAULT_IMAGE_ALLOWLIST = REQUIRED_IMAGE_TYPES | RECOMMENDED_IMAGE_TYPES


class IconValidationError(Exception):
  """Raised when an icon URI or its content is rejected for security reasons."""

  def __init__(self, src: str, reason: str) -> None:
    super().__init__(f"Icon rejected ({reason}): {src}")
    self.src = src


def validate_icon_src(src: str) -> None:
  """Validate an icon ``src`` URI scheme (§14.2): only ``https:`` or ``data:`` accepted.

  :raises IconValidationError: when the scheme is missing or not permitted. (R-14.2-o,
    R-14.2-n)
  """
  colon = src.find(":")
  if colon == -1:
    raise IconValidationError(src, "no URI scheme present")
  scheme = src[: colon + 1].lower()
  if scheme not in ("https:", "data:"):
    raise IconValidationError(src, f"scheme '{scheme}' is not permitted; only https: and data: are accepted")


def is_valid_icon_src(src: str) -> bool:
  """Return ``True`` when ``src`` passes :func:`validate_icon_src` without raising."""
  try:
    validate_icon_src(src)
    return True
  except IconValidationError:
    return False


#: Magic-byte signatures for supported image types. (R-14.2-s)
MAGIC_BYTES: tuple[tuple[str, bytes], ...] = (
  ("image/png", b"\x89PNG\r\n\x1a\n"),
  ("image/jpeg", b"\xff\xd8\xff"),
  ("image/gif", b"GIF"),
  ("image/webp", b"RIFF"),  # RIFF container; bytes 8-11 must be 'WEBP'
)


def detect_mime_type_from_magic_bytes(data: bytes) -> str | None:
  """Detect an image's MIME type from its magic bytes, treating any declared type as
  advisory (R-14.2-s). Returns ``None`` when no known signature matches.
  """
  for mime_type, signature in MAGIC_BYTES:
    if data[: len(signature)] == signature:
      if mime_type == "image/webp" and data[8:12] != b"WEBP":
        continue
      return mime_type
  # SVG is XML-based (no magic bytes) — detect by leading text.
  if len(data) >= 4:
    head = data[:100].decode("utf-8", errors="ignore").lstrip().lower()
    if head.startswith("<?xml") or head.startswith("<svg"):
      return "image/svg+xml"
  return None


def validate_icon_bytes(
  data: bytes,
  declared_mime_type: str | None = None,
  allowed_types: frozenset[str] | set[str] = DEFAULT_IMAGE_ALLOWLIST,
) -> str:
  """Validate icon byte content before rendering (§14.2). Returns the detected MIME type.

  Detects the actual type from magic bytes (ignoring the declared type), rejects unknown
  or non-allowlisted types, and — when ``declared_mime_type`` is given — rejects a
  mismatch (``image/jpg`` is normalised to ``image/jpeg``). (R-14.2-r–R-14.2-u)

  :raises IconValidationError: on any validation failure.
  """
  detected = detect_mime_type_from_magic_bytes(data)
  if detected is None:
    raise IconValidationError("(bytes)", "unknown image type; cannot render")
  if detected not in allowed_types:
    raise IconValidationError("(bytes)", f"image type {detected} is not on the allowlist")
  if declared_mime_type:
    def _norm(t: str) -> str:
      return "image/jpeg" if t == "image/jpg" else t

    if _norm(detected) != _norm(declared_mime_type):
      raise IconValidationError(
        "(bytes)", f"MIME type mismatch: declared '{declared_mime_type}', detected '{detected}'"
      )
  return detected


# ─── Secure icon fetch (§14.2) ────────────────────────────────────────────────

#: HTTP status codes that denote a redirect (the TS SDK's ``isRedirectStatus``).
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


def is_redirect_status(status: int) -> bool:
  """Return ``True`` when ``status`` is an HTTP redirect (301/302/303/307/308)."""
  return status in _REDIRECT_STATUSES


@runtime_checkable
class FetchResponse(Protocol):
  """The minimal HTTP response surface :func:`fetch_icon` consumes.

  Satisfied by ``httpx.Response`` (``status_code``, ``headers``, ``content``); a test
  fetcher need only supply these three members.
  """

  @property
  def status_code(self) -> int: ...

  @property
  def headers(self) -> dict: ...

  @property
  def content(self) -> bytes: ...


#: A ``fetch`` callable: takes a URL, returns a :class:`FetchResponse`. Redirects MUST be
#: surfaced (not auto-followed) so :func:`fetch_icon` can enforce R-14.2-p itself.
Fetch = Callable[[str], FetchResponse]


@dataclass(frozen=True)
class FetchIconResult:
  """The validated outcome of :func:`fetch_icon`."""

  bytes: bytes  #: The fetched image bytes.
  mime_type: str  #: The MIME type detected from magic bytes. (R-14.2-s)
  final_url: str  #: The URL the bytes were ultimately read from (same origin as ``src``).


def _decode_data_uri(uri: str) -> bytes:
  """Decode a ``data:`` URI payload to bytes (Base64 or percent-encoded).

  :raises IconValidationError: when the URI is malformed.
  """
  comma = uri.find(",")
  if comma == -1:
    raise IconValidationError(uri, "malformed data: URI (missing comma)")
  meta = uri[len("data:"):comma]
  payload = uri[comma + 1:]
  if re.search(r";base64$", meta, re.IGNORECASE):
    try:
      return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
      raise IconValidationError(uri, f"malformed base64 data: URI payload ({exc})") from exc
  return urllib.parse.unquote_to_bytes(payload)


def _default_fetch(url: str) -> FetchResponse:
  """The default credential-free, no-auto-redirect fetcher, backed by ``httpx``.

  Imported lazily so the synchronous validation core has no import-time network dependency.
  """
  import httpx

  return httpx.get(
    url,
    follow_redirects=False,  # R-14.2-p: redirects are vetted manually below.
    headers={},  # R-14.2-q: no Authorization / Cookie header.
    # httpx sends no cookies unless a cookie jar is supplied — this request carries none.
  )


def fetch_icon(
  src: str,
  *,
  fetch: Fetch | None = None,
  allowed_types: frozenset[str] | set[str] = DEFAULT_IMAGE_ALLOWLIST,
  max_redirects: int = 5,
) -> FetchIconResult:
  """Securely fetch and validate an icon (§14.2), enforcing the consumer security rules.

  * ``src`` MUST be ``https:`` or ``data:`` (R-14.2-o, via :func:`validate_icon_src`).
  * Redirects are followed manually; a redirect that changes the scheme or moves to a
    different origin MUST NOT be followed and is rejected (R-14.2-p, TV-20.12).
  * The request is credential-free — no ``Authorization`` or ``Cookie`` header is sent
    (R-14.2-q, TV-20.13).
  * The returned bytes are validated against the allowlist by magic bytes, ignoring any
    declared type (R-14.2-r–R-14.2-u, via :func:`validate_icon_bytes`).

  ``data:`` icons carry their bytes inline, so no network request is made.

  :raises IconValidationError: on a disallowed scheme, a cross-origin/scheme-change
    redirect, a non-2xx status, too many redirects, or invalid image bytes.
  """
  validate_icon_src(src)  # R-14.2-o: only https: or data:

  # `data:` icons carry their bytes inline — no network request, nothing to redirect.
  if src.lower().startswith("data:"):
    data = _decode_data_uri(src)
    return FetchIconResult(data, validate_icon_bytes(data, None, allowed_types), src)

  fetcher = fetch or _default_fetch
  origin = urllib.parse.urlsplit(src)
  current = src

  for _ in range(max_redirects + 1):
    response = fetcher(current)  # R-14.2-q: credential-free request (see fetcher contract).
    status = response.status_code
    if is_redirect_status(status):
      # The FetchResponse protocol guarantees ``headers`` is a mapping (httpx.Headers and
      # dict both support .get), so no defensive hasattr guard is needed.
      location = response.headers.get("location")
      if not location:
        raise IconValidationError(src, f"redirect {status} without a Location header")
      next_url = urllib.parse.urljoin(current, location)
      nxt = urllib.parse.urlsplit(next_url)
      if nxt.scheme != origin.scheme:
        raise IconValidationError(
          src, f"refusing redirect with scheme change '{origin.scheme}' → '{nxt.scheme}'"
        )
      if (nxt.scheme, nxt.netloc) != (origin.scheme, origin.netloc):
        raise IconValidationError(
          src,
          f"refusing cross-origin redirect '{origin.scheme}://{origin.netloc}' → "
          f"'{nxt.scheme}://{nxt.netloc}'",
        )
      current = next_url
      continue

    if 200 <= status < 300:
      data = bytes(response.content)
      return FetchIconResult(data, validate_icon_bytes(data, None, allowed_types), current)

    raise IconValidationError(src, f"icon fetch failed with HTTP {status}")

  raise IconValidationError(src, f"too many redirects (more than {max_redirects})")
