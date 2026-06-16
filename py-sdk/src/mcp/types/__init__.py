"""MCP type descriptors (§14).

The shared type system the feature methods build on: identity (``Implementation``,
``BaseMetadata``), ``Role``, ``Annotations``, ``Icon``, ``ResourceContents``, and the
``ContentBlock`` union. Each typed object is a Pydantic model (the analogue of the TS
SDK's Zod schemas); the ``is_valid_*`` / ``parse_*`` helpers are thin wrappers over them.
"""

from mcp.types.annotations import Annotations, is_valid_annotations
from mcp.types.base_metadata import BaseMetadata, is_valid_base_metadata, resolve_display_name
from mcp.types.content import (
  FORBIDDEN_CONTENT_BLOCK_TYPES,
  KNOWN_CONTENT_BLOCK_TYPES,
  AudioContent,
  ContentBlock,
  EmbeddedResource,
  ImageContent,
  ResourceLink,
  TextContent,
  is_forbidden_content_block_type,
  is_known_content_block_type,
  is_valid_audio_content,
  is_valid_content_block,
  is_valid_embedded_resource,
  is_valid_image_content,
  is_valid_resource_link,
  is_valid_text_content,
  parse_content_block,
)
from mcp.types.icon import (
  DEFAULT_IMAGE_ALLOWLIST,
  ICON_THEMES,
  RECOMMENDED_IMAGE_TYPES,
  REQUIRED_IMAGE_TYPES,
  Icon,
  Icons,
  IconTheme,
  IconValidationError,
  detect_mime_type_from_magic_bytes,
  is_valid_icon,
  is_valid_icon_src,
  is_valid_icons,
  validate_icon_bytes,
  validate_icon_src,
)
from mcp.types.implementation import (
  Implementation,
  is_valid_implementation,
  parse_implementation,
)
from mcp.types.resource_contents import (
  BlobResourceContents,
  ResourceContents,
  TextResourceContents,
  is_valid_base64,
  is_valid_blob_resource_contents,
  is_valid_resource_contents,
  is_valid_text_resource_contents,
  parse_resource_contents,
)
from mcp.types.role import ROLES, Role, is_role

__all__ = [
  # models
  "Implementation",
  "BaseMetadata",
  "Role",
  "Annotations",
  "Icon",
  "Icons",
  "IconTheme",
  "TextResourceContents",
  "BlobResourceContents",
  "ResourceContents",
  "TextContent",
  "ImageContent",
  "AudioContent",
  "ResourceLink",
  "EmbeddedResource",
  "ContentBlock",
  # parse / predicate helpers
  "is_valid_implementation",
  "parse_implementation",
  "is_valid_base_metadata",
  "resolve_display_name",
  "ROLES",
  "is_role",
  "is_valid_annotations",
  "is_valid_base64",
  "is_valid_text_resource_contents",
  "is_valid_blob_resource_contents",
  "is_valid_resource_contents",
  "parse_resource_contents",
  "KNOWN_CONTENT_BLOCK_TYPES",
  "FORBIDDEN_CONTENT_BLOCK_TYPES",
  "is_known_content_block_type",
  "is_forbidden_content_block_type",
  "is_valid_text_content",
  "is_valid_image_content",
  "is_valid_audio_content",
  "is_valid_resource_link",
  "is_valid_embedded_resource",
  "is_valid_content_block",
  "parse_content_block",
  "ICON_THEMES",
  "REQUIRED_IMAGE_TYPES",
  "RECOMMENDED_IMAGE_TYPES",
  "DEFAULT_IMAGE_ALLOWLIST",
  "IconValidationError",
  "is_valid_icon",
  "is_valid_icons",
  "validate_icon_src",
  "is_valid_icon_src",
  "detect_mime_type_from_magic_bytes",
  "validate_icon_bytes",
]
