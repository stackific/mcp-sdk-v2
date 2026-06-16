"""``Annotations`` — optional, untrusted hints on content blocks and resources (§14.6).

Trust model (R-14.6-f/-g): consumers MUST NOT use annotation values for security or
correctness decisions; they are advisory only and MAY influence presentation, ordering,
or context-inclusion.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

from mcp._model import JsonNumber, McpModel, validates
from mcp.types.role import Role


class Annotations(McpModel):
  """Optional hints about a piece of content or a resource (§14.6) — the Python analogue
  of the TS ``AnnotationsSchema``.

  All fields are OPTIONAL; an absent or empty object is valid. Unknown members pass
  through (forward-compatible).
  """

  #: OPTIONAL. Intended audience as ``Role`` values, e.g. ``["user", "assistant"]``. (R-14.6-b)
  audience: list[Role] | None = None
  #: OPTIONAL. Importance for operating the server, inclusive ``0..1``. (R-14.6-c, R-14.6-d)
  priority: Annotated[JsonNumber, Field(ge=0, le=1)] | None = None
  #: OPTIONAL. ISO-8601 last-modified timestamp, e.g. ``"2025-01-12T15:00:58Z"``. (R-14.6-e)
  last_modified: str | None = None


def is_valid_annotations(value: object) -> bool:
  """Return ``True`` for a valid ``Annotations`` object (§14.6).

  All fields OPTIONAL (an empty object is valid); extra members are tolerated:

  * ``audience`` — list of ``Role`` values (R-14.6-b);
  * ``priority`` — number in the inclusive range ``0..1``, booleans rejected (R-14.6-c, R-14.6-d);
  * ``lastModified`` — ISO-8601 timestamp string (R-14.6-e).
  """
  return validates(Annotations, value)
