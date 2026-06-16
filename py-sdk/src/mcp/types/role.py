"""``Role`` — the two-value conversation-participant enumeration (§14.7).

Used by ``Annotations.audience`` and by prompt messages. The set is closed: only
``"user"`` and ``"assistant"`` are valid. (R-14.7-a)
"""

from __future__ import annotations

from typing import Literal

#: A conversation participant — the closed two-value set (§14.7, R-14.7-a). The Python
#: analogue of the TS ``RoleSchema`` (a Zod enum); used as a field type on model schemas.
Role = Literal["user", "assistant"]

#: The closed set of conversation roles. (§14.7, R-14.7-a)
ROLES = frozenset({"user", "assistant"})


def is_role(value: object) -> bool:
  """Return ``True`` when ``value`` is a valid ``Role`` (``"user"`` or ``"assistant"``).

  Roles are strings, so any non-string value (including unhashable ones such as
  ``list``/``dict``) is rejected before the set-membership test — mirroring the TS
  ``typeof value === 'string'`` guard.
  """
  return isinstance(value, str) and value in ROLES
