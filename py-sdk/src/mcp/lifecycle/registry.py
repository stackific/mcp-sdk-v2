"""Registry of currently deprecated features (§27.3) and deprecation signaling (§27.4).

The registry is a derived, consolidated view (§27.3). The per-feature notices at the
cross-referenced defining sections are authoritative and resolve any conflict.

New implementations SHOULD NOT adopt the registered deprecated features; existing
implementations SHOULD migrate before each feature's earliest removal. (R-27.3-a,
R-27.3-b, §27.2 item 5)
"""

from __future__ import annotations

import sys

from mcp.lifecycle.state import DeprecatedRegistryEntry

# ─── §27.3 Registry of Deprecated Features ────────────────────────────────────

#: Consolidated registry of deprecated MCP features (§27.3).
#:
#: Features: Roots (§21), Sampling (§21), ``includeContext`` values (§21),
#: Logging (§15), the ``io.modelcontextprotocol/logLevel`` metadata key (§15),
#: Dynamic Client Registration (§23). Authoritative definitions live at the
#: cross-referenced sections; the consolidated rows below are the derived view.
DEPRECATED_REGISTRY: tuple[DeprecatedRegistryEntry, ...] = (
  DeprecatedRegistryEntry(
    feature="Roots capability",
    defined_in="§21",
    migration_note="No direct replacement; roots integration is now host-managed.",
    earliest_removal="2026-07-28",
  ),
  DeprecatedRegistryEntry(
    feature="Sampling capability",
    defined_in="§21",
    migration_note="No direct replacement; use Elicitation (§20) for structured user input.",
    earliest_removal="2026-07-28",
  ),
  DeprecatedRegistryEntry(
    feature='includeContext values "thisServer" and "allServers"',
    defined_in="§21",
    migration_note="No replacement; context management is now host-managed.",
    earliest_removal="2026-07-28",
  ),
  DeprecatedRegistryEntry(
    feature="Logging capability",
    defined_in="§15",
    migration_note=(
      "For stdio (§8), write diagnostics to stderr; for general observability, "
      "emit telemetry via an external observability framework."
    ),
    earliest_removal="2026-07-28",
  ),
  DeprecatedRegistryEntry(
    feature="io.modelcontextprotocol/logLevel _meta key",
    defined_in="§15",
    migration_note="See Logging capability migration note.",
    earliest_removal="2026-07-28",
  ),
  DeprecatedRegistryEntry(
    feature="Dynamic Client Registration",
    defined_in="§23",
    migration_note="Use static OAuth 2.0 client registration instead.",
    earliest_removal="2026-07-28",
  ),
)


# ─── §27.4 Runtime deprecation signaling ──────────────────────────────────────


def emit_deprecation_warning(feature: str, migration: str) -> None:
  """Emit a runtime deprecation warning through an out-of-band channel. (§27.4, R-27.4-d)

  The warning is written to ``stderr`` — the environment-idiomatic out-of-band channel in
  Python (the analogue of TS ``console.warn``). It is advisory only.

  IMPORTANT: This MUST NOT be emitted on the protocol wire in a way that alters the §3
  Base Message Format or the semantics of any response; warnings are out of band with
  respect to normative message processing. (R-27.4-e, §27.4)
  """
  print(f'[MCP] Deprecated feature used: "{feature}". Migration: {migration}', file=sys.stderr)


# ─── §27.3 Registry lookup ────────────────────────────────────────────────────


def find_deprecated_entry(feature: str) -> DeprecatedRegistryEntry | None:
  """Look up a feature in the deprecated registry by exact name. (§27.3)

  Returns the matching :class:`DeprecatedRegistryEntry`, or ``None`` when not found.
  """
  for entry in DEPRECATED_REGISTRY:
    if entry.feature == feature:
      return entry
  return None
