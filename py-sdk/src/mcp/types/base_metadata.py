"""``BaseMetadata`` — the shared name/title identity mixin (§14.1).

Not sent as a standalone wire message; it contributes ``name`` (REQUIRED) and ``title``
(OPTIONAL) to composing types such as ``Implementation``, ``Tool``, ``Resource``, and
``Prompt``. Display-name precedence (R-14.1-c/-d/-e): ``title`` → ``annotations.title``
(tool-only) → ``name``.
"""

from __future__ import annotations

from mcp._model import McpModel, validates


class BaseMetadata(McpModel):
  """The minimal name/title identity pair (§14.1) — the Python analogue of the TS
  ``BaseMetadataSchema``.

  All §14 field names are case-sensitive and reproduced exactly (R-14-a). Unknown members
  pass through (forward-compatible); a reserved ``_meta`` member is therefore tolerated.
  """

  #: REQUIRED. Programmatic/logical identifier; stable key for code and protocol. (R-14.1-a)
  name: str
  #: OPTIONAL. Human display name for end users, including non-experts. (R-14.1-b)
  title: str | None = None


def is_valid_base_metadata(value: object) -> bool:
  """Return ``True`` for a valid ``BaseMetadata``: REQUIRED string ``name``, OPTIONAL
  string ``title``. (§14.1, R-14.1-a, R-14.1-b)
  """
  return validates(BaseMetadata, value)


def resolve_display_name(name: str, title: str | None = None, annotations_title: str | None = None) -> str:
  """Resolve the display name to show a user, applying the §14.1 precedence.

  Returns ``title`` when non-empty, else ``annotations_title`` when non-empty (tool
  descriptors only), else ``name``. (R-14.1-c, R-14.1-d, R-14.1-e)
  """
  if title:
    return title
  if annotations_title:
    return annotations_title
  return name
