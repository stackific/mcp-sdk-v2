"""``ResourceContents`` — the concrete contents of a resource (§14.5).

Two mutually exclusive variants: ``TextResourceContents`` (carries ``text``) and
``BlobResourceContents`` (carries Base64 ``blob``). A value MUST NOT carry both
(R-14.5-h); a receiver selects the variant by which payload field is present (R-14.5-g).
"""

from __future__ import annotations

import re
from typing import Annotated, Any

from pydantic import AfterValidator, BeforeValidator, Field, TypeAdapter

from mcp._model import McpModel, validates

# Accept standard (+/) and URL-safe (-_) Base64, with optional padding. (R-14.5-f)
_BASE64_RE = re.compile(r"^[A-Za-z0-9+/\-_]*(={0,2})?$")


def is_valid_base64(s: str) -> bool:
  """Return ``True`` when ``s`` contains only valid Base64 characters (R-14.5-f)."""
  return bool(_BASE64_RE.match(s))


def _require_base64(s: str) -> str:
  """Field validator: reject a string that is not valid Base64. (R-14.5-f)"""
  if not is_valid_base64(s):
    raise ValueError("MUST contain only valid Base64 characters (R-14.5-f)")
  return s


#: A Base64 string field — the analogue of Zod ``z.string().refine(isValidBase64)``.
Base64Str = Annotated[str, AfterValidator(_require_base64)]


class TextResourceContents(McpModel):
  """Text variant of resource contents (§14.5). Use only when the resource is
  representable as text rather than binary data. (R-14.5-d, R-14.5-e)
  """

  #: REQUIRED. URI identifying the resource. (R-14.5-a)
  uri: str
  #: OPTIONAL. MIME type of the resource, if known. (R-14.5-b)
  mime_type: str | None = None
  #: REQUIRED. Textual content. (R-14.5-d)
  text: str
  #: OPTIONAL. Implementation-specific metadata. (R-14.5-c)
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


class BlobResourceContents(McpModel):
  """Binary variant of resource contents (§14.5). ``blob`` is Base64-encoded raw bytes. (R-14.5-f)"""

  #: REQUIRED. URI identifying the resource. (R-14.5-a)
  uri: str
  #: OPTIONAL. MIME type of the resource, if known. (R-14.5-b)
  mime_type: str | None = None
  #: REQUIRED. Binary content encoded as Base64. (R-14.5-f)
  blob: Base64Str
  #: OPTIONAL. Implementation-specific metadata. (R-14.5-c)
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


def _select_resource_variant(value: Any) -> Any:
  """Reject the ambiguous (both) and empty (neither) cases before the variant union.

  A receiver selects the variant by which payload field is present (R-14.5-g); a value
  carrying BOTH ``text`` and ``blob`` is invalid (R-14.5-h), as is one carrying neither.
  """
  if isinstance(value, (TextResourceContents, BlobResourceContents)):
    return value
  if isinstance(value, dict):
    has_text, has_blob = "text" in value, "blob" in value
    if has_text and has_blob:
      raise ValueError("ResourceContents MUST NOT carry both `text` and `blob` (R-14.5-h)")
    if not has_text and not has_blob:
      raise ValueError("ResourceContents MUST carry one of `text` or `blob` (R-14.5-g)")
  return value


#: The concrete contents of a resource: text or binary, selected by payload field. (§14.5)
ResourceContents = Annotated[
  TextResourceContents | BlobResourceContents,
  BeforeValidator(_select_resource_variant),
]

_RESOURCE_CONTENTS_ADAPTER: TypeAdapter[Any] = TypeAdapter(ResourceContents)


def parse_resource_contents(value: object) -> TextResourceContents | BlobResourceContents:
  """Parse a ``ResourceContents`` value, selecting the variant by payload field.

  :raises ValidationError: when the value carries both/neither payload, or is malformed.
  """
  return _RESOURCE_CONTENTS_ADAPTER.validate_python(value)


def is_valid_text_resource_contents(value: object) -> bool:
  """Return ``True`` for valid ``TextResourceContents`` (REQUIRED ``uri`` + ``text``)."""
  return validates(TextResourceContents, value)


def is_valid_blob_resource_contents(value: object) -> bool:
  """Return ``True`` for valid ``BlobResourceContents`` (REQUIRED ``uri`` + Base64 ``blob``)."""
  return validates(BlobResourceContents, value)


def is_valid_resource_contents(value: object) -> bool:
  """Return ``True`` for valid ``ResourceContents`` — exactly one of ``text``/``blob`` (§14.5).

  A value carrying BOTH is rejected. (R-14.5-g, R-14.5-h)
  """
  try:
    _RESOURCE_CONTENTS_ADAPTER.validate_python(value)
    return True
  except Exception:  # noqa: BLE001 — any validation failure means "not valid ResourceContents"
    return False
