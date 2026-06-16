/**
 * S41 — Interactive UI Extension I: Negotiation, UI Declaration & UI Resource
 * (§26.1–§26.4).
 *
 * The server-facing, *static* half of the OPTIONAL Interactive User-Interface
 * ("apps") extension: how the extension is identified and negotiated, how a
 * server DECLARES that one of its tools has an associated interactive HTML
 * interface (`_meta.ui` ⇒ {@link ToolUiMetaSchema}), and how that interface is
 * served as an ordinary MCP resource under the `ui://` scheme with the verbatim
 * `text/html;profile=mcp-app` MIME type (the UI resource and its
 * {@link ResourceUiMetaSchema} presentation/security hints).
 *
 * The extension is itself an instance of the general Extension Mechanism (S38,
 * §24): the identifier {@link UI_EXTENSION_ID} is an ordinary extension key in
 * the `extensions` capability map, negotiated by intersection, and `_meta.ui`
 * is the extension's reserved tool metadata key. This module reuses that
 * machinery rather than re-deriving it.
 *
 * The UI rendering itself, the sandbox/CSP enforcement, the host-provided
 * message channel, and consent mediation are HOST responsibilities and are not
 * implemented by a server SDK — a conforming server SDK MUST be implementable
 * with no rendering/browser/UI-toolkit dependency (R-26.1-i). This module
 * therefore models the host obligations declaratively (as documented constants
 * and predicates a host implementation can consult) but never renders anything.
 *
 * REUSE (never redefined here):
 *   - extension identifier/negotiation primitives — S38 `./extension-mechanism.js`
 *     (`isExtensionActive`, `intersectExtensions`, `mayEmitExtensionSurface`,
 *     `extensionIdsMatch`) and S11 `./extensions.js`
 *     (`getExtensionSettings`, `isExtensionAdvertised`);
 *   - the `Tool` shape and `_meta` slot — S24 `./tools.js` (`ToolSchema`);
 *   - the `io.modelcontextprotocol/clientCapabilities` request-`_meta` key —
 *     S05 `./meta.js` (`CLIENT_CAPABILITIES_META_KEY`, `MetaObjectSchema`);
 *   - the resource content shapes — S21 `../types/resource-contents.js`
 *     (`ResourceContentsSchema`);
 *   - `RESULT_TYPE` — S04 `../jsonrpc/payload.js`.
 *
 * Out of scope (owned elsewhere, per the story §5):
 *   - the UI-to-host message-channel dialect (`ui/initialize`, `ui/message`,
 *     `ui/open-link`, …), the method/notification registry, the consent/
 *     mediation flows, channel error handling — S42 (§26.5–§26.9);
 *   - the generic extension identifier grammar / negotiation machinery — S38;
 *   - the `extensions` capability-map structure — S10/S11;
 *   - the `Tool` type / `tools/list` / `tools/call` mechanics — S24/S25;
 *   - the `resources/read` request/result shape and subscriptions — S26/S27;
 *   - `server/discover` mechanics — S08; the `_meta` structure — S05.
 */

import { z } from 'zod';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import { CLIENT_CAPABILITIES_META_KEY } from './meta.js';
import {
  getExtensionSettings,
  isExtensionAdvertised,
} from './extensions.js';
import {
  isExtensionActive,
  mayEmitExtensionSurface,
} from './extension-mechanism.js';
import { ResourceContentsSchema } from '../types/resource-contents.js';

// ─── §26.2 — Extension identifier & UI MIME type ───────────────────────────────

/**
 * The Interactive UI ("apps") extension identifier: the exact, opaque,
 * case-sensitive string used as a key in the `extensions` capability map.
 * (§26.2, R-26.2-b)
 *
 * A receiver MUST treat this as an opaque, case-sensitive string — compare with
 * {@link extensionIdsMatch} (S38), never with case folding, so
 * `IO.ModelContextProtocol/UI` does NOT match. (R-26.2-b)
 */
export const UI_EXTENSION_ID = 'io.modelcontextprotocol/ui' as const;

/**
 * The UI resource MIME type, reproduced verbatim and case-sensitively, including
 * the `;profile=mcp-app` parameter and the ABSENCE of surrounding whitespace.
 * (§26.2 / §26.4, R-26.2-e, R-26.4-d)
 *
 * A host that supports the extension MUST include this exact string in its
 * advertised `mimeTypes`; a UI resource MUST be served with this exact type.
 * `"text/html; profile=mcp-app"` (extra space) and `"TEXT/HTML;PROFILE=MCP-APP"`
 * (wrong case) do NOT satisfy the requirement.
 */
export const UI_MIME_TYPE = 'text/html;profile=mcp-app' as const;

/**
 * Returns `true` when `mimeType` is exactly the UI MIME type {@link UI_MIME_TYPE}
 * — matched verbatim and case-sensitively, with no whitespace tolerance.
 * (R-26.2-e, R-26.4-d)
 *
 * This is the single gate behind "the host advertised the required type" and
 * "the resource was served with the required type": both demand the byte-exact
 * string, so trimming or lower-casing would be non-conformant.
 */
export function isUiMimeType(mimeType: unknown): mimeType is typeof UI_MIME_TYPE {
  return mimeType === UI_MIME_TYPE;
}

/**
 * The `ui://` URI scheme prefix designating an MCP UI resource. The host MUST
 * treat the whole URI as opaque and MUST NOT derive a network origin from it.
 * (§26.4, R-26.4-b, R-26.4-c)
 */
export const UI_URI_SCHEME = 'ui://' as const;

/**
 * Returns `true` when `uri` is a `ui://`-scheme URI string. The authority and
 * path after `ui://` are server-defined and opaque; this only checks the scheme
 * — it deliberately parses no structure, because the host MUST treat the whole
 * URI as an opaque identifier and derive no network origin from it. (§26.4,
 * R-26.3-b, R-26.4-b, R-26.4-c)
 */
export function isUiResourceUri(uri: unknown): uri is string {
  return typeof uri === 'string' && uri.startsWith(UI_URI_SCHEME);
}

// ─── §26.1 — Roles: server vs host responsibility split ────────────────────────

/**
 * The two parties in the apps extension. The division of responsibilities
 * between them is fixed and normative. (§26.1)
 */
export type UiRole = 'server' | 'host';

/**
 * The discrete responsibilities the apps extension assigns, each fixed to a
 * single role. (§26.1, R-26.1-b..h)
 *
 *   - `declare-ui-meta`   — declare the UI association via `_meta.ui` (server);
 *   - `serve-ui-resource` — serve the `ui://` resource via `resources/read` (server);
 *   - `render`            — render the UI (host);
 *   - `sandbox`           — render in a sandboxed, isolated browsing context (host);
 *   - `enforce-csp`       — enforce CSP and permissions (host);
 *   - `run-channel`       — run the message-channel dialect of §26.5 (host);
 *   - `mediate-consent`   — mediate and obtain user consent (host).
 */
export type UiResponsibility =
  | 'declare-ui-meta'
  | 'serve-ui-resource'
  | 'render'
  | 'sandbox'
  | 'enforce-csp'
  | 'run-channel'
  | 'mediate-consent';

/**
 * The fixed, normative assignment of each {@link UiResponsibility} to the role
 * that owns it. (§26.1, R-26.1-b, R-26.1-c, R-26.1-d, R-26.1-e, R-26.1-f,
 * R-26.1-g, R-26.1-h)
 *
 * The server (and server-side SDK) is RESPONSIBLE only for declaring the
 * association and serving the resource; everything to do with rendering,
 * isolation, policy enforcement, the channel, and consent is the host's. A
 * server SDK is explicitly NOT responsible for rendering, sandboxing, or the
 * channel (R-26.1-d) — those rows map to `'host'`.
 */
export const UI_RESPONSIBILITY_OWNER: Readonly<Record<UiResponsibility, UiRole>> =
  Object.freeze({
    'declare-ui-meta': 'server',
    'serve-ui-resource': 'server',
    render: 'host',
    sandbox: 'host',
    'enforce-csp': 'host',
    'run-channel': 'host',
    'mediate-consent': 'host',
  });

/** Returns the role that owns `responsibility`. (§26.1) */
export function uiResponsibilityOwner(responsibility: UiResponsibility): UiRole {
  return UI_RESPONSIBILITY_OWNER[responsibility];
}

/**
 * Returns `true` when `responsibility` belongs to the server (and server-side
 * SDK) — i.e. it is one of the only two server obligations, declaring `_meta.ui`
 * and serving the `ui://` resource. (R-26.1-b, R-26.1-c)
 *
 * Every other responsibility — render, sandbox, enforce CSP/permissions, run
 * the channel, mediate consent — returns `false`: a conforming server SDK does
 * NOT carry them and MUST be implementable with no rendering/browser/UI-toolkit
 * dependency. (R-26.1-d, R-26.1-i)
 */
export function isServerResponsibility(responsibility: UiResponsibility): boolean {
  return uiResponsibilityOwner(responsibility) === 'server';
}

// ─── §26.2 — `UiHostExtensionCapability` (the host's advertised value) ──────────

/**
 * `UiHostExtensionCapability` — the value a host advertises under
 * {@link UI_EXTENSION_ID} in the `extensions` map of the
 * `io.modelcontextprotocol/clientCapabilities` it carries in request `_meta`.
 * (§26.2, R-26.2-c, R-26.2-d, R-26.2-e)
 *
 * `mimeTypes` is REQUIRED: the UI resource MIME types the host can render. A
 * host that supports this extension MUST include the exact {@link UI_MIME_TYPE}
 * string. The shape is validated structurally here (a string array); the
 * verbatim-MIME requirement is checked by {@link hostAdvertisesUiRendering} /
 * {@link capabilityRendersUi}, not by the schema, so a malformed-but-parseable
 * advertisement is still recognized as "advertised the extension, but not
 * conformingly". `.passthrough()` preserves forward-compatible members.
 */
export const UiHostExtensionCapabilitySchema = z
  .object({
    /**
     * REQUIRED. MIME types the host can render as interactive user interfaces;
     * MUST include {@link UI_MIME_TYPE} to enable UI rendering. (R-26.2-d, R-26.2-e)
     */
    mimeTypes: z.array(z.string()),
  })
  .passthrough();

export type UiHostExtensionCapability = z.infer<typeof UiHostExtensionCapabilitySchema>;

/**
 * Returns `true` when `value` is a well-formed {@link UiHostExtensionCapability}
 * (a `mimeTypes` string array is present). This does NOT require the UI MIME
 * type to be present — use {@link capabilityRendersUi} for that. (R-26.2-d)
 */
export function isUiHostExtensionCapability(value: unknown): value is UiHostExtensionCapability {
  return UiHostExtensionCapabilitySchema.safeParse(value).success;
}

/**
 * Returns `true` when an advertised host capability value enables UI rendering:
 * it is a well-formed {@link UiHostExtensionCapability} AND its `mimeTypes`
 * array contains the verbatim {@link UI_MIME_TYPE}. (R-26.2-d, R-26.2-e)
 *
 * A capability whose `mimeTypes` carries only `"text/html; profile=mcp-app"`
 * (extra whitespace) or `"TEXT/HTML;PROFILE=MCP-APP"` (wrong case) returns
 * `false`: the string is matched byte-exact and case-sensitively.
 */
export function capabilityRendersUi(value: unknown): boolean {
  if (!isUiHostExtensionCapability(value)) return false;
  return value.mimeTypes.some(isUiMimeType);
}

/**
 * Builds a conformant {@link UiHostExtensionCapability} for a host that supports
 * UI rendering. {@link UI_MIME_TYPE} is always included (deduplicated) so the
 * result satisfies R-26.2-e; additional renderable MIME types MAY be supplied
 * and are appended in order. (§26.2, R-26.2-d, R-26.2-e)
 *
 * @param additionalMimeTypes - Extra MIME types the host can render, beyond the
 *   mandatory UI type.
 */
export function buildUiHostExtensionCapability(
  additionalMimeTypes: readonly string[] = [],
): UiHostExtensionCapability {
  const mimeTypes = [UI_MIME_TYPE, ...additionalMimeTypes.filter((m) => m !== UI_MIME_TYPE)];
  return { mimeTypes };
}

// ─── §26.2 — Reading the host advertisement from negotiation surfaces ───────────

/**
 * Reads the {@link UiHostExtensionCapability} a host advertised under
 * {@link UI_EXTENSION_ID} from an `extensions` map (raw), or `undefined` when
 * the extension is not validly advertised or its value is not a well-formed
 * capability. (§26.2, R-26.2-c, R-26.2-d)
 *
 * @param extensionsMap - A host's advertised `extensions` map (raw); typically
 *   `clientCapabilities.extensions`.
 */
export function getUiHostCapability(extensionsMap: unknown): UiHostExtensionCapability | undefined {
  const settings = getExtensionSettings(extensionsMap, UI_EXTENSION_ID);
  if (settings === undefined) return undefined;
  return isUiHostExtensionCapability(settings) ? settings : undefined;
}

/**
 * Returns `true` when a host's `extensions` map advertises the apps extension in
 * a way that enables UI rendering: the {@link UI_EXTENSION_ID} key is present
 * with a {@link UiHostExtensionCapability} whose `mimeTypes` includes the
 * verbatim {@link UI_MIME_TYPE}. (§26.2, R-26.2-c, R-26.2-d, R-26.2-e)
 *
 * This is the predicate behind the server's two prohibitions: a server MUST NOT
 * declare UI associations (R-26.2-f) and MUST NOT expect any UI resource to be
 * rendered (R-26.2-g) unless this returns `true` for the host's advertisement.
 * See {@link mayServerDeclareUi} / {@link mayServerExpectRendering}.
 *
 * @param extensionsMap - A host's advertised `extensions` map (raw), e.g.
 *   `clientCapabilities.extensions`.
 */
export function hostAdvertisesUiRendering(extensionsMap: unknown): boolean {
  return capabilityRendersUi(getUiHostCapability(extensionsMap));
}

/**
 * Reads the host's advertised `extensions` map from a single request's `_meta`
 * (the map nested under `io.modelcontextprotocol/clientCapabilities.extensions`)
 * and reports whether it advertises UI rendering with the required MIME type.
 * (§26.2, R-26.2-c)
 *
 * A host that supports rendering UIs MUST advertise the extension in the
 * `_meta` of EVERY request (R-26.2-c); the stateless model means each request is
 * judged on its own `_meta`. A request whose `_meta` omits the advertisement —
 * or omits `clientCapabilities` entirely — yields `false`, and the server
 * treats that request as if the extension were inactive (R-26.2-i).
 *
 * @param requestMeta - The request's `_meta` object (raw).
 */
export function requestAdvertisesUiRendering(requestMeta: unknown): boolean {
  if (typeof requestMeta !== 'object' || requestMeta === null) return false;
  const clientCaps = (requestMeta as Record<string, unknown>)[CLIENT_CAPABILITIES_META_KEY];
  if (typeof clientCaps !== 'object' || clientCaps === null) return false;
  const extensions = (clientCaps as Record<string, unknown>)['extensions'];
  return hostAdvertisesUiRendering(extensions);
}

// ─── §26.2 — Server gating: may declare UI / expect rendering ──────────────────

/**
 * Returns `true` when a server MAY declare UI associations on its tools — only
 * when the host has advertised the extension with a `mimeTypes` array that
 * includes the verbatim {@link UI_MIME_TYPE}. A server MUST NOT declare UI
 * associations otherwise. (§26.2, R-26.2-f)
 *
 * @param hostExtensionsMap - The host's advertised `extensions` map (raw), e.g.
 *   `clientCapabilities.extensions`.
 */
export function mayServerDeclareUi(hostExtensionsMap: unknown): boolean {
  return hostAdvertisesUiRendering(hostExtensionsMap);
}

/**
 * Returns `true` when a server MAY expect a UI resource to be rendered — only
 * when the host has advertised the extension with the required {@link UI_MIME_TYPE}.
 * A server MUST NOT expect rendering otherwise. (§26.2, R-26.2-g)
 *
 * Same gate as {@link mayServerDeclareUi}; named separately so each prohibition
 * (declare vs expect-rendering) reads clearly at the call site.
 *
 * @param hostExtensionsMap - The host's advertised `extensions` map (raw).
 */
export function mayServerExpectRendering(hostExtensionsMap: unknown): boolean {
  return hostAdvertisesUiRendering(hostExtensionsMap);
}

/**
 * Returns `true` when, for an interaction, the apps extension is ACTIVE between
 * client and server — both validly advertise {@link UI_EXTENSION_ID} in their
 * `extensions` maps. (§26.2, R-26.2-a; reuses S38 {@link isExtensionActive}.)
 *
 * Mere presence of the key on one side does not activate the extension; the
 * receiver computes the intersection. When inactive, the host treats a tool
 * carrying `_meta.ui` as a normal tool and ignores the UI key. (R-26.2-i)
 *
 * @param clientExtensions - The client/host's advertised `extensions` map (raw).
 * @param serverExtensions - The server's advertised `extensions` map (raw).
 */
export function isUiExtensionActive(clientExtensions: unknown, serverExtensions: unknown): boolean {
  return isExtensionActive(UI_EXTENSION_ID, clientExtensions, serverExtensions);
}

/**
 * Returns `true` when the apps extension is in `activeSet` and the server MAY
 * therefore emit its surface (the `_meta.ui` key, the `ui://` resource) for this
 * interaction. (§26.2, R-26.2-a; reuses S38 {@link mayEmitExtensionSurface}.)
 *
 * @param activeSet - The identifiers active for this interaction (e.g. from
 *   S38 `computeActiveSet` / `activeSetForRequest`).
 */
export function mayEmitUiSurface(activeSet: Iterable<string>): boolean {
  return mayEmitExtensionSurface(UI_EXTENSION_ID, activeSet);
}

// ─── §26.2 — Server acknowledgement in `server/discover` ───────────────────────

/**
 * `ServerUiAcknowledgement` — the value a server places under
 * {@link UI_EXTENSION_ID} in `capabilities.extensions` of its `server/discover`
 * result to acknowledge the extension. It is an object that MAY be empty (`{}`);
 * presence of the key is what signals acknowledgement. (§26.2, R-26.2-j)
 *
 * `.passthrough()` allows forward-compatible members an extension version may
 * add to the acknowledgement object.
 */
export const ServerUiAcknowledgementSchema = z.object({}).passthrough();

export type ServerUiAcknowledgement = z.infer<typeof ServerUiAcknowledgementSchema>;

/**
 * Builds the `capabilities.extensions` fragment a server includes in its
 * `server/discover` result to acknowledge the apps extension: a single
 * {@link UI_EXTENSION_ID} key mapped to an empty object. (§26.2, R-26.2-j)
 *
 * Acknowledgement is OPTIONAL (MAY); a server merges this fragment into the
 * `extensions` map of its result capabilities when it chooses to acknowledge.
 */
export function buildServerUiAcknowledgement(): { [UI_EXTENSION_ID]: ServerUiAcknowledgement } {
  return { [UI_EXTENSION_ID]: {} };
}

/**
 * Returns `true` when a server's `server/discover` result `capabilities.extensions`
 * map acknowledges the apps extension — the {@link UI_EXTENSION_ID} key is
 * present with a (possibly empty) object value. (§26.2, R-26.2-j; reuses S11
 * {@link isExtensionAdvertised}.)
 *
 * @param serverExtensionsMap - The `capabilities.extensions` map from a
 *   `DiscoverResult` (raw).
 */
export function serverAcknowledgesUi(serverExtensionsMap: unknown): boolean {
  return isExtensionAdvertised(serverExtensionsMap, UI_EXTENSION_ID);
}

// ─── §26.3 — `ToolUiMeta` (the `_meta.ui` declaration on a tool) ───────────────

/**
 * The reserved nested key under a tool's `_meta` that carries the UI
 * declaration: `ui`, giving the path `_meta.ui`. (§26.3)
 */
export const TOOL_UI_META_KEY = 'ui' as const;

/**
 * The exact visibility enum strings: which actor may invoke a tool. (§26.3,
 * R-26.3-d)
 *
 *   - `"model"` — callable by the model/agent via ordinary tool-calling (§16);
 *   - `"app"`   — callable by the rendered UI over the channel (§26.5).
 */
export const UI_VISIBILITY_VALUES = ['model', 'app'] as const;

/** A single visibility actor. (§26.3, R-26.3-d) */
export type UiVisibility = (typeof UI_VISIBILITY_VALUES)[number];

/** Schema for one visibility enum value. (R-26.3-d) */
export const UiVisibilitySchema = z.enum(UI_VISIBILITY_VALUES);

/**
 * The effective `visibility` when `_meta.ui.visibility` is omitted: both actors
 * may invoke the tool. (§26.3, R-26.3-d)
 */
export const DEFAULT_UI_VISIBILITY: readonly UiVisibility[] = Object.freeze(['model', 'app']);

/**
 * `ToolUiMeta` — the object at a tool's `_meta.ui` declaring its associated
 * interactive UI. (§26.3)
 *
 * Fields:
 *   - `resourceUri` REQUIRED: the `ui://`-scheme URI of the UI resource to render
 *     for this tool; the host reads it via `resources/read` for this EXACT URI.
 *     The schema enforces the `ui://` scheme so a non-`ui://` value is rejected
 *     as a UI association. (R-26.3-a, R-26.3-b, R-26.3-c)
 *   - `visibility` OPTIONAL: an array drawn from `"model"`/`"app"`; omitted ⇒
 *     `["model","app"]`. (R-26.3-d)
 *
 * `.passthrough()` preserves forward-compatible members a later extension
 * version may add.
 */
export const ToolUiMetaSchema = z
  .object({
    /** REQUIRED `ui://` URI of the UI resource. (R-26.3-a, R-26.3-b) */
    resourceUri: z.string().refine(isUiResourceUri, {
      message: `resourceUri MUST use the ${UI_URI_SCHEME} scheme (R-26.3-b)`,
    }),
    /** OPTIONAL invoking actors; omitted ⇒ `["model","app"]`. (R-26.3-d) */
    visibility: z.array(UiVisibilitySchema).optional(),
  })
  .passthrough();

export type ToolUiMeta = z.infer<typeof ToolUiMetaSchema>;

/** Returns `true` when `value` is a well-formed {@link ToolUiMeta}. (§26.3) */
export function isToolUiMeta(value: unknown): value is ToolUiMeta {
  return ToolUiMetaSchema.safeParse(value).success;
}

/**
 * Extracts the {@link ToolUiMeta} from a tool — i.e. parses `tool._meta.ui` —
 * returning `undefined` when there is no `_meta`, no `ui` key, or the value is
 * not a well-formed declaration. (§26.3)
 *
 * This does NOT gate on negotiation: a receiver that has not negotiated the
 * extension MUST ignore the key (R-26.3-g) — use {@link readToolUiMeta} for the
 * negotiation-aware read.
 *
 * @param tool - A tool object (or anything with an optional `_meta.ui`).
 */
export function getToolUiMeta(tool: unknown): ToolUiMeta | undefined {
  if (typeof tool !== 'object' || tool === null) return undefined;
  const meta = (tool as Record<string, unknown>)['_meta'];
  if (typeof meta !== 'object' || meta === null) return undefined;
  const ui = (meta as Record<string, unknown>)[TOOL_UI_META_KEY];
  const parsed = ToolUiMetaSchema.safeParse(ui);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Reads a tool's UI declaration ONLY when the extension is active for the
 * interaction; returns `undefined` when the extension is not active, modeling
 * "a receiver that does not negotiate this extension MUST ignore the `_meta.ui`
 * key". (§26.3, R-26.3-g, R-26.2-i)
 *
 * When inactive the tool is treated as a normal tool and the key is ignored —
 * its presence MUST NOT change the behavior of an ordinary `tools/call`
 * (R-26.3-h); this read simply yields no declaration.
 *
 * @param tool     - The tool object.
 * @param activeSet - Identifiers active for this interaction.
 */
export function readToolUiMeta(tool: unknown, activeSet: Iterable<string>): ToolUiMeta | undefined {
  if (!mayEmitUiSurface(activeSet)) return undefined;
  return getToolUiMeta(tool);
}

/**
 * Returns the EFFECTIVE visibility of a UI declaration: the declared
 * `visibility` array when present, otherwise the default `["model","app"]`.
 * (§26.3, R-26.3-d)
 *
 * @param meta - A {@link ToolUiMeta} (or its `visibility` may be omitted).
 */
export function effectiveVisibility(meta: Pick<ToolUiMeta, 'visibility'>): readonly UiVisibility[] {
  return meta.visibility ?? DEFAULT_UI_VISIBILITY;
}

/**
 * Returns `true` when a tool's effective visibility includes `"app"` — i.e. the
 * rendered UI MAY invoke it over the channel. A host SHOULD reject a
 * UI-originated `tools/call` for a tool whose effective `visibility` does NOT
 * include `"app"`. (§26.3, R-26.3-e)
 *
 * @param meta - The tool's {@link ToolUiMeta}.
 */
export function isAppInvokable(meta: Pick<ToolUiMeta, 'visibility'>): boolean {
  return effectiveVisibility(meta).includes('app');
}

/**
 * Returns `true` when a host SHOULD REJECT a `tools/call` that originates from a
 * rendered UI, given the tool's UI declaration: it is rejected exactly when the
 * tool's effective visibility excludes `"app"`. (§26.3, R-26.3-e)
 *
 * A tool with no UI declaration (`undefined`) was not exposed to the UI at all;
 * a UI-originated call for it is likewise rejected.
 *
 * @param meta - The tool's {@link ToolUiMeta}, or `undefined` when it has none.
 */
export function hostShouldRejectUiOriginatedCall(meta: Pick<ToolUiMeta, 'visibility'> | undefined): boolean {
  if (meta === undefined) return true;
  return !isAppInvokable(meta);
}

/**
 * Returns `true` when a tool's effective visibility includes `"model"` — i.e. it
 * appears in the model's tool list and is callable via ordinary tool-calling. A
 * tool with `visibility` `["app"]` is callable ONLY by the UI and is HIDDEN from
 * the model's tool list, so this returns `false`. (§26.3, R-26.3-f)
 *
 * @param meta - The tool's {@link ToolUiMeta}.
 */
export function isVisibleToModel(meta: Pick<ToolUiMeta, 'visibility'>): boolean {
  return effectiveVisibility(meta).includes('model');
}

/**
 * Filters tools to those visible to the model, applying the §26.3 hide rule:
 * a tool whose effective UI visibility is `["app"]`-only is omitted from the
 * model's tool list. (§26.3, R-26.3-f)
 *
 * The extension must be active for the rule to apply (R-26.3-g): when inactive,
 * `_meta.ui` is ignored and every tool is treated as an ordinary, model-visible
 * tool. A tool with no UI declaration is always model-visible.
 *
 * @param tools    - The tools to filter.
 * @param activeSet - Identifiers active for this interaction.
 */
export function toolsVisibleToModel<T>(tools: readonly T[], activeSet: Iterable<string>): T[] {
  if (!mayEmitUiSurface(activeSet)) return [...tools];
  return tools.filter((tool) => {
    const meta = getToolUiMeta(tool);
    return meta === undefined || isVisibleToModel(meta);
  });
}

// ─── §26.4 — UI resource hints: CSP, permissions, domain, border ───────────────

/**
 * `UiContentSecurityPolicy` — a content-security-policy descriptor carried in a
 * UI resource's `_meta.ui.csp`. Each member is an array of origin strings; an
 * origin NOT listed in the applicable member MUST be blocked by the host.
 * (§26.4, R-26.4-f, R-26.4-g)
 *
 * All members are OPTIONAL. When `csp` itself is omitted, the host MUST apply a
 * restrictive deny-by-default policy (R-26.4-h) — see {@link resolveCsp}.
 * `.passthrough()` preserves forward-compatible CSP members.
 */
export const UiContentSecurityPolicySchema = z
  .object({
    /** OPTIONAL. Origins the UI MAY open network connections to. (R-26.4-f) */
    connectDomains: z.array(z.string()).optional(),
    /** OPTIONAL. Origins the UI MAY load scripts/styles/images/media from. (R-26.4-f) */
    resourceDomains: z.array(z.string()).optional(),
    /** OPTIONAL. Origins the UI MAY embed in nested frames. (R-26.4-f) */
    frameDomains: z.array(z.string()).optional(),
    /** OPTIONAL. Origins permitted as the document base URI. (R-26.4-f) */
    baseUriDomains: z.array(z.string()).optional(),
  })
  .passthrough();

export type UiContentSecurityPolicy = z.infer<typeof UiContentSecurityPolicySchema>;

/** The four CSP descriptor members, in spec order. (§26.4, R-26.4-f) */
export const UI_CSP_DIRECTIVES = [
  'connectDomains',
  'resourceDomains',
  'frameDomains',
  'baseUriDomains',
] as const;

/** A single CSP descriptor directive name. (§26.4) */
export type UiCspDirective = (typeof UI_CSP_DIRECTIVES)[number];

/**
 * Returns `true` when `origin` is ALLOWED for the given CSP `directive` of a
 * `csp` descriptor — it is explicitly listed in that member. An origin not
 * listed (including when the member is absent) MUST be blocked. (§26.4,
 * R-26.4-g)
 *
 * @param csp       - The resolved CSP descriptor, or `undefined` when `csp` was
 *   omitted — in which case deny-by-default applies and this always returns
 *   `false` (R-26.4-h).
 * @param directive - Which CSP member to consult.
 * @param origin    - The origin string to test.
 */
export function cspAllowsOrigin(
  csp: UiContentSecurityPolicy | undefined,
  directive: UiCspDirective,
  origin: string,
): boolean {
  if (csp === undefined) return false; // deny-by-default (R-26.4-h)
  const allowed = csp[directive];
  return Array.isArray(allowed) && allowed.includes(origin);
}

/**
 * The deny-by-default CSP a host MUST apply when a UI resource omits `csp`:
 * every directive is an empty origin list, so every origin is blocked. (§26.4,
 * R-26.4-h)
 */
export const DENY_BY_DEFAULT_CSP: Readonly<Required<Pick<UiContentSecurityPolicy, UiCspDirective>>> =
  Object.freeze({
    connectDomains: [] as string[],
    resourceDomains: [] as string[],
    frameDomains: [] as string[],
    baseUriDomains: [] as string[],
  });

/**
 * Resolves the CSP a host applies for a UI resource: the declared `csp` when
 * present, otherwise the restrictive {@link DENY_BY_DEFAULT_CSP} (deny-by-default).
 * (§26.4, R-26.4-h)
 *
 * The host MUST apply a restrictive policy CONSTRAINED by the declared
 * descriptor — i.e. it never grants an origin the descriptor did not list — so a
 * present `csp` is returned as-is for the host to constrain its policy by
 * (R-26.4-o). An absent `csp` yields the all-empty deny-by-default policy.
 *
 * @param csp - The UI resource's declared `csp`, or `undefined`.
 */
export function resolveCsp(csp: UiContentSecurityPolicy | undefined): UiContentSecurityPolicy {
  return csp ?? DENY_BY_DEFAULT_CSP;
}

/**
 * `UiPermissions` — sandbox capabilities a UI requests, carried in a UI
 * resource's `_meta.ui.permissions`. Each present member is an empty object
 * `{}`; presence requests that capability, absence means it is not requested.
 * The host MUST NOT grant a capability that is not requested. (§26.4, R-26.4-i,
 * R-26.4-j)
 *
 * All members are OPTIONAL. `.passthrough()` preserves forward-compatible
 * permission members.
 */
export const UiPermissionsSchema = z
  .object({
    /** OPTIONAL. Presence requests camera access. (R-26.4-i) */
    camera: z.object({}).passthrough().optional(),
    /** OPTIONAL. Presence requests microphone access. (R-26.4-i) */
    microphone: z.object({}).passthrough().optional(),
    /** OPTIONAL. Presence requests geolocation access. (R-26.4-i) */
    geolocation: z.object({}).passthrough().optional(),
    /** OPTIONAL. Presence requests clipboard-write access. (R-26.4-i) */
    clipboardWrite: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type UiPermissions = z.infer<typeof UiPermissionsSchema>;

/** The four sandbox capability names a UI MAY request, in spec order. (§26.4, R-26.4-i) */
export const UI_PERMISSION_NAMES = ['camera', 'microphone', 'geolocation', 'clipboardWrite'] as const;

/** A single requestable sandbox capability. (§26.4, R-26.4-i) */
export type UiPermissionName = (typeof UI_PERMISSION_NAMES)[number];

/**
 * Returns `true` when a UI resource's `permissions` REQUESTS the named sandbox
 * capability — i.e. the member is present. Absence means the capability is not
 * requested, and the host MUST NOT grant it. (§26.4, R-26.4-i, R-26.4-j)
 *
 * @param permissions - The UI resource's declared `permissions`, or `undefined`.
 * @param name        - The capability to test.
 */
export function permissionRequested(
  permissions: UiPermissions | undefined,
  name: UiPermissionName,
): boolean {
  if (permissions === undefined) return false;
  return permissions[name] !== undefined;
}

/**
 * Returns the set of sandbox capabilities a UI resource requests, as the subset
 * of {@link UI_PERMISSION_NAMES} present in `permissions`. The host MUST NOT
 * grant any capability outside this set (R-26.4-j) and MAY decline any within it
 * (R-26.4-k). (§26.4, R-26.4-i)
 *
 * @param permissions - The UI resource's declared `permissions`, or `undefined`.
 */
export function requestedPermissions(permissions: UiPermissions | undefined): UiPermissionName[] {
  if (permissions === undefined) return [];
  return UI_PERMISSION_NAMES.filter((name) => permissions[name] !== undefined);
}

/**
 * Returns `true` when a host MAY grant the named sandbox capability for a UI
 * resource: ONLY when it was requested (the host MUST NOT grant an unrequested
 * capability) AND the host did not decline it (the host MAY decline a requested
 * one). (§26.4, R-26.4-j, R-26.4-k)
 *
 * @param permissions - The UI resource's declared `permissions`.
 * @param name        - The capability under consideration.
 * @param hostDeclines - Whether the host chooses to decline this requested
 *   capability (the host's own decision, R-26.4-k); defaults to `false`.
 */
export function mayGrantPermission(
  permissions: UiPermissions | undefined,
  name: UiPermissionName,
  hostDeclines = false,
): boolean {
  if (!permissionRequested(permissions, name)) return false; // never grant the unrequested (R-26.4-j)
  return !hostDeclines; // MAY decline the requested (R-26.4-k)
}

/**
 * `ResourceUiMeta` — the optional presentation and security hints carried on a
 * UI resource's `contents` entry under its own `_meta.ui`. When present, these
 * hints take effect for rendering. (§26.4, R-26.4-e)
 *
 * Fields:
 *   - `csp` OPTIONAL: origins the UI may contact/load/frame (R-26.4-f);
 *   - `permissions` OPTIONAL: sandbox capabilities requested (R-26.4-i);
 *   - `domain` OPTIONAL: a dedicated origin the host SHOULD render under,
 *     isolating the UI from other UI resources (R-26.4-l);
 *   - `prefersBorder` OPTIONAL: a border-presentation preference the host MAY
 *     honor or ignore (R-26.4-m).
 *
 * `.passthrough()` preserves forward-compatible hint members.
 */
export const ResourceUiMetaSchema = z
  .object({
    /** OPTIONAL. Origins the UI may contact/load/frame. (R-26.4-f) */
    csp: UiContentSecurityPolicySchema.optional(),
    /** OPTIONAL. Sandbox capabilities the UI requests. (R-26.4-i) */
    permissions: UiPermissionsSchema.optional(),
    /** OPTIONAL. Dedicated origin to render the UI under, for isolation. (R-26.4-l) */
    domain: z.string().optional(),
    /** OPTIONAL. Server preference that the host render a visible border. (R-26.4-m) */
    prefersBorder: z.boolean().optional(),
  })
  .passthrough();

export type ResourceUiMeta = z.infer<typeof ResourceUiMetaSchema>;

/** Returns `true` when `value` is a well-formed {@link ResourceUiMeta}. (§26.4) */
export function isResourceUiMeta(value: unknown): value is ResourceUiMeta {
  return ResourceUiMetaSchema.safeParse(value).success;
}

// ─── §26.4 — The UI resource content ───────────────────────────────────────────

/**
 * Schema for a UI resource's `contents` entry: an ordinary `ResourceContents`
 * (S21 — `text` or `blob`, mutually exclusive) whose `mimeType` MUST be the
 * verbatim {@link UI_MIME_TYPE}, OPTIONALLY carrying {@link ResourceUiMeta}
 * presentation/security hints under `_meta.ui`. (§26.4, R-26.4-d, R-26.4-e)
 *
 * The base shape and the text/blob exclusivity come from
 * {@link ResourceContentsSchema} and are NOT re-declared; this narrows the
 * OPTIONAL `mimeType` to the exact UI type (so a UI resource carrying any other
 * MIME type is rejected) and parses the nested `_meta.ui` hint object.
 */
export const UiResourceContentsSchema = ResourceContentsSchema.superRefine((contents, ctx) => {
  const c = contents as Record<string, unknown>;
  if (!isUiMimeType(c['mimeType'])) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mimeType'],
      message: `UI resource content mimeType MUST be exactly "${UI_MIME_TYPE}" (R-26.4-d)`,
    });
  }
  const meta = c['_meta'];
  if (typeof meta === 'object' && meta !== null) {
    const ui = (meta as Record<string, unknown>)[TOOL_UI_META_KEY];
    if (ui !== undefined && !ResourceUiMetaSchema.safeParse(ui).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['_meta', TOOL_UI_META_KEY],
        message: 'UI resource _meta.ui hints are malformed (R-26.4-e)',
      });
    }
  }
});

export type UiResourceContents = z.infer<typeof UiResourceContentsSchema>;

/** Returns `true` when `value` is a well-formed UI resource `contents` entry. (§26.4) */
export function isUiResourceContents(value: unknown): value is UiResourceContents {
  return UiResourceContentsSchema.safeParse(value).success;
}

/**
 * Extracts the {@link ResourceUiMeta} hints from a UI resource `contents` entry
 * — i.e. parses `contents._meta.ui` — returning `undefined` when there are no
 * hints or they are malformed. When present, these hints take effect for
 * rendering. (§26.4, R-26.4-e)
 *
 * @param contents - A UI resource `contents` entry (or any resource contents).
 */
export function getResourceUiMeta(contents: unknown): ResourceUiMeta | undefined {
  if (typeof contents !== 'object' || contents === null) return undefined;
  const meta = (contents as Record<string, unknown>)['_meta'];
  if (typeof meta !== 'object' || meta === null) return undefined;
  const ui = (meta as Record<string, unknown>)[TOOL_UI_META_KEY];
  const parsed = ResourceUiMetaSchema.safeParse(ui);
  return parsed.success ? parsed.data : undefined;
}

/** The server-supplied inputs to a UI resource `contents` entry. */
export interface UiResourceContentsConfig {
  /** REQUIRED `ui://` URI of the resource. (R-26.3-b, R-26.4-b) */
  uri: string;
  /** The HTML document as text. Provide EITHER `text` or `blob`, not both. */
  text?: string;
  /** The document as Base64 (binary-encoded payload). Provide EITHER `text` or `blob`. */
  blob?: string;
  /** OPTIONAL presentation/security hints carried under `_meta.ui`. (R-26.4-e) */
  ui?: ResourceUiMeta;
}

/**
 * Builds a UI resource `contents` entry: the `ui://` `uri`, the verbatim
 * {@link UI_MIME_TYPE}, the `text` OR `blob` payload, and — when supplied — the
 * {@link ResourceUiMeta} hints nested under `_meta.ui`. (§26.4, R-26.4-d,
 * R-26.4-e)
 *
 * `mimeType` is always set to the exact UI type so the result satisfies
 * R-26.4-d. Exactly one of `text`/`blob` MUST be supplied (the text/blob
 * exclusivity of S21).
 *
 * @throws {RangeError} when `uri` is not a `ui://` URI, or when neither/both of
 *   `text` and `blob` are supplied.
 */
export function buildUiResourceContents(config: UiResourceContentsConfig): UiResourceContents {
  if (!isUiResourceUri(config.uri)) {
    throw new RangeError(`UI resource uri MUST use the ${UI_URI_SCHEME} scheme (R-26.4-b)`);
  }
  const hasText = config.text !== undefined;
  const hasBlob = config.blob !== undefined;
  if (hasText === hasBlob) {
    throw new RangeError('A UI resource content MUST carry exactly one of `text` or `blob` (R-14.5-h)');
  }
  const base: Record<string, unknown> = {
    uri: config.uri,
    mimeType: UI_MIME_TYPE,
  };
  if (hasText) base['text'] = config.text;
  else base['blob'] = config.blob;
  if (config.ui !== undefined) {
    base['_meta'] = { [TOOL_UI_META_KEY]: config.ui };
  }
  return UiResourceContentsSchema.parse(base);
}

/**
 * Builds the result object a server returns from `resources/read` for a UI
 * resource: a complete, cacheable result carrying the single UI
 * `contents` entry. (§26.4)
 *
 * The result mirrors the S27 `ReadResourceResult` shape used in the §26.4 wire
 * example: `resultType: "complete"`, a `contents` array, and the REQUIRED
 * `ttlMs`/`cacheScope` cache fields. The full `ReadResourceResult` schema and
 * its caching semantics are owned by S19/S27; this builder only assembles the
 * UI-specific content into that shape.
 *
 * @param contents   - The UI resource `contents` entry (e.g. from
 *   {@link buildUiResourceContents}).
 * @param cache      - The REQUIRED cache fields (`ttlMs` non-negative integer,
 *   `cacheScope`).
 */
export function buildUiResourceReadResult(
  contents: UiResourceContents,
  cache: { ttlMs: number; cacheScope: 'public' | 'private' },
): {
  resultType: typeof RESULT_TYPE.COMPLETE;
  contents: UiResourceContents[];
  ttlMs: number;
  cacheScope: 'public' | 'private';
} {
  if (!Number.isInteger(cache.ttlMs) || cache.ttlMs < 0) {
    throw new RangeError('UI resource read result ttlMs MUST be a non-negative integer (R-13)');
  }
  return {
    resultType: RESULT_TYPE.COMPLETE,
    contents: [contents],
    ttlMs: cache.ttlMs,
    cacheScope: cache.cacheScope,
  };
}

// ─── §26.4 — `ui://` URI opacity (host obligations, declarative) ───────────────

/**
 * Returns the `ui://` URI to use in a `resources/read` request for a tool's UI
 * resource: the EXACT `resourceUri` from the tool's `_meta.ui`, treated as an
 * opaque identifier. The host issues `resources/read` for this exact string and
 * MUST NOT derive a network origin from it. (§26.4, R-26.3-c, R-26.4-b,
 * R-26.4-c)
 *
 * Returns `undefined` when the tool carries no (well-formed) UI declaration.
 * This performs no parsing of the URI beyond the scheme check already done at
 * declaration time — honoring "treat the whole URI as an opaque identifier".
 *
 * @param meta - The tool's {@link ToolUiMeta}.
 */
export function uiResourceReadUri(meta: Pick<ToolUiMeta, 'resourceUri'> | undefined): string | undefined {
  return meta?.resourceUri;
}
