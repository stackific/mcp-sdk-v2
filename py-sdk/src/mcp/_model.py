"""Shared Pydantic base for MCP wire-typed objects.

The Python analogue of the TS SDK's Zod object schemas: a declarative model that
validates an incoming JSON object and serializes back to the wire shape. The conventions
mirror the Zod usage across ``ts-sdk`` so the two ports stay in lockstep:

* ``extra="allow"`` ≙ Zod ``.passthrough()`` — unknown fields are preserved, never
  rejected (the §2.6 / §6.6 forward-compatibility rule). Round-tripping a model keeps
  any keys the receiver does not recognize.
* fields are snake_case (idiomatic Python) with camelCase wire aliases generated
  automatically (:func:`pydantic.alias_generators.to_camel`); ``populate_by_name`` lets
  callers construct a model with either the Python name or the wire alias.
* :meth:`McpModel.to_wire` dumps the camelCase, omit-absent JSON object the JSON-RPC
  envelope carries — the analogue of a TS object flowing straight onto the wire.

Only the *typed* protocol objects subclass :class:`McpModel`; the dynamic JSON-RPC
envelope itself stays a plain ``dict`` (mirroring TS's ``Record<string, unknown>``).
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, ValidationError
from pydantic.alias_generators import to_camel


def _require_number(value: Any) -> Any:
  """Require an actual JSON number (``int``/``float``), rejecting ``bool`` and strings.

  Zod's ``z.number()`` accepts only ``typeof value === 'number'``; Pydantic's lax mode
  would otherwise coerce ``True``→``1`` (``bool`` is an ``int`` subclass) and numeric
  strings like ``"4096"``→``4096``. This before-validator restores Zod's strictness while
  still preserving int-vs-float (the value passes through untouched when already numeric).
  """
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    raise ValueError("expected a number")
  return value


#: A JSON number — accepts ``int``/``float`` only, rejecting booleans and numeric strings,
#: and preserves int-vs-float. The faithful Python analogue of Zod ``z.number()``.
JsonNumber = Annotated[int | float, BeforeValidator(_require_number)]


def validates(model: type[BaseModel], value: object) -> bool:
  """Return ``True`` when ``value`` validates against ``model`` — the predicate analogue
  of Zod's ``Schema.safeParse(value).success``.

  Backs the ``is_valid_*`` helpers so their logic lives in a declarative model rather than
  hand-rolled checks.
  """
  try:
    model.model_validate(value)
    return True
  except ValidationError:
    return False


class McpModel(BaseModel):
  """Base class for MCP wire-typed objects (the Zod-object analogue).

  Subclasses declare snake_case fields; the camelCase wire aliases are generated
  automatically. Unknown fields pass through (``extra="allow"`` ≙ ``.passthrough()``).
  """

  model_config = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    extra="allow",
  )

  def to_wire(self) -> dict[str, Any]:
    """Serialize to the wire JSON object: camelCase keys, omitting absent (``None``) fields.

    The analogue of a TS object serializing straight to JSON. Passthrough fields
    (``extra="allow"``) are preserved verbatim with their original keys.
    """
    return self.model_dump(by_alias=True, exclude_none=True)

  @property
  def extra(self) -> dict[str, Any]:
    """The forward-compatible passthrough fields a receiver did not recognize.

    The §2.6 / §6.6 "ignore unknown fields" set — every key not declared by this model
    (``extra="allow"`` keeps them). Always a dict (``{}`` when there are none).
    """
    return self.model_extra if self.model_extra is not None else {}
