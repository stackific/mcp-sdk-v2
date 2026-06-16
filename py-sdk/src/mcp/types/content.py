"""``ContentBlock`` — the discriminated-union payload of tool-call results and prompt
messages (§14.4).

Five known member types, dispatched by the case-sensitive ``type`` field. An unknown
``type`` is treated as unsupported content (forward-compatible) rather than failing the
whole message (R-14.4-a, R-14.4-b) — EXCEPT the deprecated sampling types ``tool_use`` /
``tool_result``, which MUST NOT appear here (R-14.8-a, R-14.8-b).

The five member types are Pydantic models (the analogues of the TS ``*ContentSchema``);
the union dispatch + forward-compatible fallback live in :func:`is_valid_content_block` /
:func:`parse_content_block`, mirroring the TS ``z.union([...]).refine(...)``.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from mcp._model import JsonNumber, McpModel, validates
from mcp.types.annotations import Annotations
from mcp.types.icon import Icon
from mcp.types.resource_contents import Base64Str, ResourceContents

#: Known ContentBlock discriminators. (§14.4)
KNOWN_CONTENT_BLOCK_TYPES = ("text", "image", "audio", "resource_link", "resource")

#: ``type`` values from the deprecated sampling capability that MUST NOT appear. (R-14.8-a/-b)
FORBIDDEN_CONTENT_BLOCK_TYPES = frozenset({"tool_use", "tool_result"})


class _ContentBlock(McpModel):
  """Shared optional tail every content block carries: ``annotations`` and ``_meta``."""

  #: OPTIONAL. Untrusted presentation hints. (§14.6)
  annotations: Annotations | None = None
  #: OPTIONAL. Implementation-specific metadata.
  meta: dict[str, Any] | None = Field(default=None, alias="_meta")


class TextContent(_ContentBlock):
  """Inline text content (§14.4.1)."""

  type: Literal["text"]
  #: REQUIRED. The text content. (R-14.4.1-b)
  text: str


class ImageContent(_ContentBlock):
  """Inline image content (§14.4.2)."""

  type: Literal["image"]
  #: REQUIRED. Image bytes as Base64. (R-14.4.2-b)
  data: Base64Str
  #: REQUIRED. MIME type of the image. (R-14.4.2-c)
  mime_type: str


class AudioContent(_ContentBlock):
  """Inline audio content (§14.4.3)."""

  type: Literal["audio"]
  #: REQUIRED. Audio bytes as Base64. (R-14.4.3-b)
  data: Base64Str
  #: REQUIRED. MIME type of the audio. (R-14.4.3-c)
  mime_type: str


class ResourceLink(_ContentBlock):
  """A content block that references a resource by URI instead of embedding it (§14.4.4)."""

  type: Literal["resource_link"]
  #: REQUIRED. URI of the referenced resource [RFC3986]. (R-14.4.4-b)
  uri: str
  #: REQUIRED. Programmatic identifier (from BaseMetadata). (R-14.4.4-c)
  name: str
  #: OPTIONAL. Human display name. (R-14.4.4-d)
  title: str | None = None
  #: OPTIONAL. Icons representing the resource. (R-14.4.4-e)
  icons: list[Icon] | None = None
  #: OPTIONAL. Description usable as a hint to a language model. (R-14.4.4-f)
  description: str | None = None
  #: OPTIONAL. MIME type of the resource, if known. (R-14.4.4-g)
  mime_type: str | None = None
  #: OPTIONAL. Raw resource size in bytes, before encoding/tokenization. (R-14.4.4-i)
  size: JsonNumber | None = None


class EmbeddedResource(_ContentBlock):
  """A content block that embeds a resource's contents directly (§14.4.5)."""

  type: Literal["resource"]
  #: REQUIRED. The embedded contents: text or binary, by which field is present. (R-14.4.5-b)
  resource: ResourceContents


#: The known ``ContentBlock`` member models, keyed by discriminator.
_KNOWN_MODELS: dict[str, type[_ContentBlock]] = {
  "text": TextContent,
  "image": ImageContent,
  "audio": AudioContent,
  "resource_link": ResourceLink,
  "resource": EmbeddedResource,
}

#: A ``ContentBlock`` — one of the known member models, or a raw ``dict`` for a
#: forward-compatible unknown ``type``.
ContentBlock = TextContent | ImageContent | AudioContent | ResourceLink | EmbeddedResource | dict[str, Any]


def is_known_content_block_type(type_: str) -> bool:
  """Return ``True`` when ``type_`` is a known, supported ``ContentBlock`` type. (R-14.4-b)"""
  return type_ in KNOWN_CONTENT_BLOCK_TYPES


def is_forbidden_content_block_type(type_: str) -> bool:
  """Return ``True`` when ``type_`` is a forbidden sampling content type. (R-14.8-a/-b)"""
  return type_ in FORBIDDEN_CONTENT_BLOCK_TYPES


def is_valid_text_content(value: object) -> bool:
  """Inline text content (§14.4.1): ``type:"text"`` + REQUIRED string ``text``."""
  return validates(TextContent, value)


def is_valid_image_content(value: object) -> bool:
  """Inline image content (§14.4.2): ``type:"image"`` + Base64 ``data`` + ``mimeType``."""
  return validates(ImageContent, value)


def is_valid_audio_content(value: object) -> bool:
  """Inline audio content (§14.4.3): ``type:"audio"`` + Base64 ``data`` + ``mimeType``."""
  return validates(AudioContent, value)


def is_valid_resource_link(value: object) -> bool:
  """A resource reference by URI (§14.4.4): ``type:"resource_link"`` + ``uri`` + ``name``."""
  return validates(ResourceLink, value)


def is_valid_embedded_resource(value: object) -> bool:
  """An embedded resource (§14.4.5): ``type:"resource"`` + a valid ``ResourceContents``."""
  return validates(EmbeddedResource, value)


def is_valid_content_block(value: object) -> bool:
  """Return ``True`` for a valid ``ContentBlock`` (§14.4).

  Known types are validated strictly against their models; an unknown ``type`` is accepted
  as forward-compatible unsupported content (R-14.4-b) UNLESS it is a forbidden sampling
  type (R-14.8-a/-b).
  """
  if not isinstance(value, dict) or not isinstance(value.get("type"), str):
    return False
  type_ = value["type"]
  model = _KNOWN_MODELS.get(type_)
  if model is not None:
    return validates(model, value)
  # Unknown type: forward-compatible, unless it is a forbidden sampling type.
  return not is_forbidden_content_block_type(type_)


def parse_content_block(value: object) -> ContentBlock:
  """Parse a ``ContentBlock`` (§14.4) — the analogue of ``ContentBlockSchema.parse``.

  A known ``type`` is validated into its model; an unknown (non-forbidden) ``type`` is
  returned as the raw ``dict`` (forward-compatible unsupported content, R-14.4-b).

  :raises ValueError: when the value is malformed, a known type fails validation, or the
    type is a forbidden sampling type (R-14.8-a/-b).
  """
  if not isinstance(value, dict) or not isinstance(value.get("type"), str):
    raise ValueError("ContentBlock MUST be an object with a string `type`")
  type_ = value["type"]
  model = _KNOWN_MODELS.get(type_)
  if model is not None:
    return model.model_validate(value)
  if is_forbidden_content_block_type(type_):
    raise ValueError(
      "tool_use/tool_result MUST NOT appear where a ContentBlock is expected (R-14.8-a, R-14.8-b)"
    )
  return value
