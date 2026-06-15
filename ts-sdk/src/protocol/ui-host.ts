/**
 * S42 — Interactive UI Extension II: UI-to-Host Dialect, Registry & Security
 * (§26.5–§26.9).
 *
 * The runtime, *dynamic* half of the OPTIONAL Interactive User-Interface
 * ("apps") extension: the JSON-RPC 2.0 message dialect a rendered UI (running in
 * its sandbox) speaks with its host over a host-provided channel, the verbatim
 * method/notification name registry that dialect uses, and the normative
 * security/consent model a host MUST enforce around it. S41 (`./ui.js`)
 * established *what* a UI is and how it is declared and served; this module
 * defines *how* it talks to the host once rendered, and how that channel is kept
 * safe.
 *
 * The dialect is framed identically to core MCP (§3 / S03): every message is a
 * JSON-RPC request, response, or notification. It reuses a small subset of core
 * method names verbatim (`tools/call`, `resources/read`, `ping`,
 * `notifications/message`) and adds the `ui/`-prefixed names. Its handshake
 * carries its OWN protocol-version revision ({@link UI_DIALECT_PROTOCOL_VERSION},
 * `"2026-01-26"`) — independent of the core revision negotiated at
 * `server/discover`.
 *
 * As with S41, rendering, sandboxing, CSP/permission enforcement, running the
 * channel runtime, and obtaining user consent are HOST responsibilities and are
 * NOT obligations of a server SDK (R-26.9-d). This module therefore models the
 * dialect declaratively — the message schemas, the registry, and a set of host
 * predicates/builders a host implementation can consult — but never renders
 * anything and takes no browser/UI-toolkit dependency.
 *
 * REUSE (never redefined here):
 *   - the S41 UI symbols — `./ui.js`
 *     ({@link UI_EXTENSION_ID}, {@link UI_MIME_TYPE}, {@link UiPermissionsSchema},
 *     {@link UiContentSecurityPolicySchema}, {@link hostShouldRejectUiOriginatedCall},
 *     {@link effectiveVisibility}, {@link resolveCsp}, {@link DENY_BY_DEFAULT_CSP},
 *     {@link requestedPermissions}, {@link buildServerUiAcknowledgement}, …);
 *   - the JSON-RPC framing — S03 `../jsonrpc/framing.js`
 *     ({@link classifyMessage}, {@link MalformedMessageError});
 *   - the error model — S34 `./errors.js`
 *     ({@link METHOD_NOT_FOUND_CODE}, {@link INVALID_PARAMS_CODE},
 *     {@link INTERNAL_ERROR_CODE}, {@link buildErrorObject}, {@link buildErrorResponse}…
 *     via {@link JsonRpcErrorResponse});
 *   - the content-block shape — S21 `../types/content.js` ({@link ContentBlockSchema});
 *   - the core logging notification method name — S23 `./logging.js`
 *     ({@link LOGGING_MESSAGE_METHOD});
 *   - the empty-result discriminator — S04 `../jsonrpc/payload.js` is NOT needed
 *     here (dialect results are bare `{}`, not core `Result` objects).
 *
 * Out of scope (owned elsewhere, per the story §5):
 *   - the UI extension identifier, the host advertisement, `_meta.ui`, the
 *     `visibility` enum, and the `ui://` UI resource hints — S41 (§26.1–§26.4);
 *   - the base JSON-RPC request/response/notification framing — S03 (§3);
 *   - the `ContentBlock` shapes and the §16 tool-result structured-content shape
 *     — S21 / S25;
 *   - the core `tools/call` / `resources/read` request/result schemas — S24–S27;
 *   - the standard error-code definitions — S34 (§22).
 */

import { z } from 'zod';
import { classifyMessage, MalformedMessageError } from '../jsonrpc/framing.js';
import { ContentBlockSchema } from '../types/content.js';
import { LOGGING_MESSAGE_METHOD } from './logging.js';
import {
  METHOD_NOT_FOUND_CODE,
  INVALID_PARAMS_CODE,
  INTERNAL_ERROR_CODE,
  buildErrorObject,
  type JsonRpcErrorObject,
  type JsonRpcErrorResponse,
  type JsonRpcId,
} from './errors.js';
import {
  UiPermissionsSchema,
  UiContentSecurityPolicySchema,
  hostShouldRejectUiOriginatedCall,
  type UiPermissions,
  type UiContentSecurityPolicy,
  type ToolUiMeta,
} from './ui.js';

// ─── §26.5 — Dialect protocol version ──────────────────────────────────────────

/**
 * The exact, case-sensitive protocol-version string carried in this dialect's
 * initialization handshake. It identifies the *message-dialect* revision and is
 * INDEPENDENT of the core protocol revision negotiated at `server/discover`
 * (§5). (§26.5, R-26.5-b)
 *
 * This is deliberately a distinct constant from any core-revision string: the
 * two revisions evolve separately, and conflating them is a conformance error.
 */
export const UI_DIALECT_PROTOCOL_VERSION = '2026-01-26' as const;

/**
 * Returns `true` when `value` is exactly the dialect protocol version
 * {@link UI_DIALECT_PROTOCOL_VERSION} — matched byte-for-byte and
 * case-sensitively. (R-26.5-b)
 */
export function isUiDialectProtocolVersion(
  value: unknown,
): value is typeof UI_DIALECT_PROTOCOL_VERSION {
  return value === UI_DIALECT_PROTOCOL_VERSION;
}

// ─── §26.5.1 — Display modes ────────────────────────────────────────────────────

/**
 * The three display modes a UI may run in / request. (§26.5.1, §26.5.3)
 *
 *   - `"inline"`     — embedded inline within the host surface;
 *   - `"fullscreen"` — occupying the whole host viewport;
 *   - `"pip"`        — a picture-in-picture / floating presentation.
 */
export const UI_DISPLAY_MODES = ['inline', 'fullscreen', 'pip'] as const;

/** A single display mode. (§26.5.1) */
export type UiDisplayMode = (typeof UI_DISPLAY_MODES)[number];

/** Schema for one display-mode enum value. */
export const UiDisplayModeSchema = z.enum(UI_DISPLAY_MODES);

// ─── §26.6 — Method & notification name registry (verbatim) ─────────────────────

/**
 * The complete set of dialect method and notification names, reproduced
 * VERBATIM and case-sensitively. These are the only names a conforming dialect
 * message may carry; a name that is not byte-for-byte one of these is not part
 * of the dialect. (§26.6, R-26.5-a)
 *
 * `notifications/message` is the core logging method name reused verbatim — it
 * is taken from S23's {@link LOGGING_MESSAGE_METHOD}, never re-spelled.
 */
export const UI_DIALECT_METHODS = {
  /** request, UI → Host. Opens the channel. (§26.5.1) */
  INITIALIZE: 'ui/initialize',
  /** notification, UI → Host. Handshake completion. (§26.5.1) */
  INITIALIZED: 'ui/notifications/initialized',
  /** notification, Host → UI. Complete tool arguments. (§26.5.2) */
  TOOL_INPUT: 'ui/notifications/tool-input',
  /** notification, Host → UI. Streaming snapshot of tool arguments. (§26.5.2) */
  TOOL_INPUT_PARTIAL: 'ui/notifications/tool-input-partial',
  /** notification, Host → UI. The tool result. (§26.5.2) */
  TOOL_RESULT: 'ui/notifications/tool-result',
  /** notification, Host → UI. The tool call was cancelled. (§26.5.2) */
  TOOL_CANCELLED: 'ui/notifications/tool-cancelled',
  /** request, UI → Host. Invoke a server tool (mediated). (§26.5.3) */
  TOOLS_CALL: 'tools/call',
  /** request, UI → Host. Read a server resource (mediated). (§26.5.3) */
  RESOURCES_READ: 'resources/read',
  /** request, UI → Host. Open an external link. (§26.5.3) */
  OPEN_LINK: 'ui/open-link',
  /** request, UI → Host. Insert a conversation message. (§26.5.3) */
  MESSAGE: 'ui/message',
  /** request, UI → Host. Request a display-mode change. (§26.5.3) */
  REQUEST_DISPLAY_MODE: 'ui/request-display-mode',
  /** request, UI → Host. Supply content into the model context. (§26.5.3) */
  UPDATE_MODEL_CONTEXT: 'ui/update-model-context',
  /** notification, UI → Host. A logging message (core §15.3 shape reused). (§26.5.3) */
  LOG_MESSAGE: LOGGING_MESSAGE_METHOD,
  /** request, UI ↔ Host (either direction). Liveness probe. (§26.5.3) */
  PING: 'ping',
  /** notification, Host → UI. Container size changed. (§26.5.4) */
  SIZE_CHANGED: 'ui/notifications/size-changed',
  /** notification, Host → UI. Host-context fields changed (partial). (§26.5.4) */
  HOST_CONTEXT_CHANGED: 'ui/notifications/host-context-changed',
  /** request, Host → UI. Tear down before removal. (§26.5.4) */
  RESOURCE_TEARDOWN: 'ui/resource-teardown',
  /** notification, Sandbox → Host. Sandbox proxy is ready (host-internal). (§26.5.5) */
  SANDBOX_PROXY_READY: 'ui/notifications/sandbox-proxy-ready',
  /** notification, Host → Sandbox. Deliver resource HTML + policy (host-internal). (§26.5.5) */
  SANDBOX_RESOURCE_READY: 'ui/notifications/sandbox-resource-ready',
} as const;

/** One of the verbatim dialect method/notification names. (§26.6) */
export type UiDialectMethod = (typeof UI_DIALECT_METHODS)[keyof typeof UI_DIALECT_METHODS];

/** Whether a registry entry is a JSON-RPC `request` or a `notification`. (§26.6) */
export type UiDialectKind = 'request' | 'notification';

/** The originator/direction of a dialect message, per the §26.6 "Sender" column. */
export type UiDialectSender =
  | 'ui-to-host'
  | 'host-to-ui'
  | 'ui-or-host'
  | 'sandbox-to-host'
  | 'host-to-sandbox';

/** One row of the §26.6 registry: the verbatim name, its kind, and its direction. */
export interface UiDialectRegistryEntry {
  /** The verbatim, case-sensitive method/notification name. (R-26.5-a) */
  readonly name: UiDialectMethod;
  /** Whether the message is a request or a notification. */
  readonly kind: UiDialectKind;
  /** Which side originates the message. */
  readonly sender: UiDialectSender;
}

/**
 * The complete §26.6 registry, in spec order: all 19 distinct names with their
 * kind and direction. The host validates a dialect message's `method` against
 * this table byte-for-byte. (§26.6, R-26.5-a; covers AC-42.1)
 */
export const UI_DIALECT_REGISTRY: readonly UiDialectRegistryEntry[] = Object.freeze([
  { name: UI_DIALECT_METHODS.INITIALIZE, kind: 'request', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.INITIALIZED, kind: 'notification', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.TOOL_INPUT, kind: 'notification', sender: 'host-to-ui' },
  { name: UI_DIALECT_METHODS.TOOL_INPUT_PARTIAL, kind: 'notification', sender: 'host-to-ui' },
  { name: UI_DIALECT_METHODS.TOOL_RESULT, kind: 'notification', sender: 'host-to-ui' },
  { name: UI_DIALECT_METHODS.TOOL_CANCELLED, kind: 'notification', sender: 'host-to-ui' },
  { name: UI_DIALECT_METHODS.TOOLS_CALL, kind: 'request', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.RESOURCES_READ, kind: 'request', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.OPEN_LINK, kind: 'request', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.MESSAGE, kind: 'request', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.REQUEST_DISPLAY_MODE, kind: 'request', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.UPDATE_MODEL_CONTEXT, kind: 'request', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.LOG_MESSAGE, kind: 'notification', sender: 'ui-to-host' },
  { name: UI_DIALECT_METHODS.PING, kind: 'request', sender: 'ui-or-host' },
  { name: UI_DIALECT_METHODS.SIZE_CHANGED, kind: 'notification', sender: 'host-to-ui' },
  { name: UI_DIALECT_METHODS.HOST_CONTEXT_CHANGED, kind: 'notification', sender: 'host-to-ui' },
  { name: UI_DIALECT_METHODS.RESOURCE_TEARDOWN, kind: 'request', sender: 'host-to-ui' },
  { name: UI_DIALECT_METHODS.SANDBOX_PROXY_READY, kind: 'notification', sender: 'sandbox-to-host' },
  { name: UI_DIALECT_METHODS.SANDBOX_RESOURCE_READY, kind: 'notification', sender: 'host-to-sandbox' },
]);

/** The set of all verbatim dialect names, for O(1) membership tests. */
const UI_DIALECT_NAME_SET: ReadonlySet<string> = new Set(
  UI_DIALECT_REGISTRY.map((e) => e.name),
);

/** Lookup table by name. */
const UI_DIALECT_BY_NAME: ReadonlyMap<string, UiDialectRegistryEntry> = new Map(
  UI_DIALECT_REGISTRY.map((e) => [e.name as string, e]),
);

/**
 * Returns `true` when `name` is one of the verbatim dialect method/notification
 * names — matched byte-for-byte and case-sensitively, so `"UI/Initialize"` or
 * `"ui/Initialize"` do NOT match. (§26.6, R-26.5-a; AC-42.1)
 */
export function isUiDialectMethodName(name: unknown): name is UiDialectMethod {
  return typeof name === 'string' && UI_DIALECT_NAME_SET.has(name);
}

/** Returns the §26.6 registry entry for `name`, or `undefined` if not a dialect name. */
export function uiDialectRegistryEntry(name: string): UiDialectRegistryEntry | undefined {
  return UI_DIALECT_BY_NAME.get(name);
}

// ─── §26.5.1 — `ui/initialize` request params ──────────────────────────────────

/** UI identity carried in the handshake. (§26.5.1) */
export const UiClientInfoSchema = z
  .object({
    /** REQUIRED. UI name. */
    name: z.string(),
    /** REQUIRED. UI version. */
    version: z.string(),
  })
  .passthrough();

export type UiClientInfo = z.infer<typeof UiClientInfoSchema>;

/**
 * Capabilities the UI offers, declared in `ui/initialize.params.appCapabilities`.
 * (§26.5.1) All members OPTIONAL; `.passthrough()` preserves forward-compatible
 * members.
 */
export const UiAppCapabilitiesSchema = z
  .object({
    /** OPTIONAL. Experimental, non-standard capability bag. */
    experimental: z.object({}).passthrough().optional(),
    /** OPTIONAL. The UI exposes tools and may notify on list change. */
    tools: z.object({ listChanged: z.boolean().optional() }).passthrough().optional(),
    /** OPTIONAL. The display modes the UI supports. */
    availableDisplayModes: z.array(UiDisplayModeSchema).optional(),
  })
  .passthrough();

export type UiAppCapabilities = z.infer<typeof UiAppCapabilitiesSchema>;

/**
 * `UiInitializeParams` — params of the `ui/initialize` request the UI sends to
 * open the channel. (§26.5.1)
 *
 * Every field is OPTIONAL: a UI MAY open the channel with no params at all. The
 * `protocolVersion`, when present, SHOULD be {@link UI_DIALECT_PROTOCOL_VERSION}.
 */
export const UiInitializeParamsSchema = z
  .object({
    /** OPTIONAL. Dialect revision the UI implements, e.g. `"2026-01-26"`. */
    protocolVersion: z.string().optional(),
    /** OPTIONAL. UI identity. */
    clientInfo: UiClientInfoSchema.optional(),
    /** OPTIONAL. Capabilities the UI offers. */
    appCapabilities: UiAppCapabilitiesSchema.optional(),
  })
  .passthrough();

export type UiInitializeParams = z.infer<typeof UiInitializeParamsSchema>;

// ─── §26.5.1 — `UiHostContext` ─────────────────────────────────────────────────

/** Host identity carried in the initialize result. (§26.5.1) */
export const UiHostInfoSchema = z
  .object({
    /** REQUIRED. Host name. */
    name: z.string(),
    /** REQUIRED. Host version. */
    version: z.string(),
  })
  .passthrough();

export type UiHostInfo = z.infer<typeof UiHostInfoSchema>;

/** The active theme. (§26.5.1) */
export const UI_THEMES = ['light', 'dark'] as const;
export type UiTheme = (typeof UI_THEMES)[number];

/** The host platform. (§26.5.1) */
export const UI_PLATFORMS = ['web', 'desktop', 'mobile'] as const;
export type UiPlatform = (typeof UI_PLATFORMS)[number];

/**
 * `UiHostContext` — the rendering environment the host delivers to the UI in the
 * initialize result, and (as a PARTIAL) in `ui/notifications/host-context-changed`.
 * (§26.5.1, §26.5.4)
 *
 * Every member is OPTIONAL, so the same schema validates both the full initial
 * context and a partial change carrying only the changed members. Use
 * {@link UiHostContextSchema} for the full/partial shape and
 * {@link HostContextChangedParamsSchema} for the change notification's params.
 */
export const UiHostContextSchema = z
  .object({
    /** OPTIONAL. The tool this UI was rendered for (§16 tool shape, kept opaque here). */
    toolInfo: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        tool: z.record(z.unknown()),
      })
      .passthrough()
      .optional(),
    /** OPTIONAL. Active theme. */
    theme: z.enum(UI_THEMES).optional(),
    /** OPTIONAL. Host style variables and font CSS. */
    styles: z
      .object({
        variables: z.record(z.string()).optional(),
        css: z.object({ fonts: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    /** OPTIONAL. Current display mode. */
    displayMode: UiDisplayModeSchema.optional(),
    /** OPTIONAL. Modes the host can switch to. */
    availableDisplayModes: z.array(z.string()).optional(),
    /** OPTIONAL. Current container sizing. */
    containerDimensions: z
      .object({
        height: z.number().optional(),
        maxHeight: z.number().optional(),
        width: z.number().optional(),
        maxWidth: z.number().optional(),
      })
      .passthrough()
      .optional(),
    /** OPTIONAL. Active locale. */
    locale: z.string().optional(),
    /** OPTIONAL. Active time zone. */
    timeZone: z.string().optional(),
    /** OPTIONAL. Host user-agent string. */
    userAgent: z.string().optional(),
    /** OPTIONAL. Host platform. */
    platform: z.enum(UI_PLATFORMS).optional(),
    /** OPTIONAL. Input-device capabilities. */
    deviceCapabilities: z
      .object({ touch: z.boolean().optional(), hover: z.boolean().optional() })
      .passthrough()
      .optional(),
    /** OPTIONAL. Safe-area insets. */
    safeAreaInsets: z
      .object({
        top: z.number(),
        right: z.number(),
        bottom: z.number(),
        left: z.number(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type UiHostContext = z.infer<typeof UiHostContextSchema>;

// ─── §26.5.1 — `UiInitializeResult` ────────────────────────────────────────────

/**
 * `hostCapabilities.sandbox` — what the host actually granted: the effective CSP
 * it applied and the permissions it granted. (§26.5.1, §26.7)
 *
 * The shapes are the S41 {@link UiPermissionsSchema} / {@link UiContentSecurityPolicySchema}
 * — never re-declared. `permissions` reports the GRANTED set (a subset of what
 * the resource requested, R-26.7-h), and `csp` reports the EFFECTIVE policy the
 * host applied (R-26.7-g).
 */
export const UiSandboxReportSchema = z
  .object({
    /** Permissions actually granted to the UI. (R-26.7-h) */
    permissions: UiPermissionsSchema.optional(),
    /** Effective content-security policy applied. (R-26.7-g) */
    csp: UiContentSecurityPolicySchema.optional(),
  })
  .passthrough();

export type UiSandboxReport = z.infer<typeof UiSandboxReportSchema>;

/**
 * Host capabilities reported in the initialize result. (§26.5.1) The presence of
 * `openLinks` signals the host honors `ui/open-link`; `sandbox` carries the
 * effective CSP and granted permissions (§26.7).
 */
export const UiHostCapabilitiesSchema = z
  .object({
    /** OPTIONAL. Experimental, non-standard capability bag. */
    experimental: z.object({}).passthrough().optional(),
    /** OPTIONAL. Present if the host honors `ui/open-link`. */
    openLinks: z.object({}).passthrough().optional(),
    /** OPTIONAL. The host exposes server tools to the UI. */
    serverTools: z.object({ listChanged: z.boolean().optional() }).passthrough().optional(),
    /** OPTIONAL. The host exposes server resources to the UI. */
    serverResources: z.object({ listChanged: z.boolean().optional() }).passthrough().optional(),
    /** OPTIONAL. The host accepts `notifications/message` log notifications. */
    logging: z.object({}).passthrough().optional(),
    /** OPTIONAL. The effective sandbox CSP + granted permissions. (§26.7) */
    sandbox: UiSandboxReportSchema.optional(),
  })
  .passthrough();

export type UiHostCapabilities = z.infer<typeof UiHostCapabilitiesSchema>;

/**
 * `UiInitializeResult` — the host's reply to `ui/initialize`. (§26.5.1)
 *
 * `protocolVersion` is REQUIRED — its absence is a conformance failure
 * (R-26.5.1-b; AC-42.4). `hostInfo`, `hostCapabilities`, and `hostContext` are
 * OPTIONAL. The reported `hostCapabilities.sandbox.csp`/`.permissions` are the
 * effective/granted values (§26.7).
 */
export const UiInitializeResultSchema = z
  .object({
    /** REQUIRED. Dialect revision, e.g. `"2026-01-26"`. (R-26.5.1-b) */
    protocolVersion: z.string(),
    /** OPTIONAL. Host identity. */
    hostInfo: UiHostInfoSchema.optional(),
    /** OPTIONAL. Host capabilities, incl. the effective sandbox report. */
    hostCapabilities: UiHostCapabilitiesSchema.optional(),
    /** OPTIONAL. Initial rendering context. */
    hostContext: UiHostContextSchema.optional(),
  })
  .passthrough();

export type UiInitializeResult = z.infer<typeof UiInitializeResultSchema>;

/**
 * Returns `true` when `value` is a well-formed {@link UiInitializeResult} — in
 * particular it carries a string `protocolVersion`. The absence of that field is
 * a conformance failure. (R-26.5.1-b; AC-42.4)
 */
export function isUiInitializeResult(value: unknown): value is UiInitializeResult {
  return UiInitializeResultSchema.safeParse(value).success;
}

// ─── §26.5.2 — Host → UI delivery notification params ──────────────────────────

/**
 * `ToolInputParams` — params of `ui/notifications/tool-input` and, identically,
 * `ui/notifications/tool-input-partial`. Carries the complete (or, for the
 * partial variant, a streaming snapshot of) tool arguments. (§26.5.2)
 */
export const ToolInputParamsSchema = z
  .object({
    /** REQUIRED. The (complete or partial) tool arguments. */
    arguments: z.record(z.unknown()),
  })
  .passthrough();

export type ToolInputParams = z.infer<typeof ToolInputParamsSchema>;

/**
 * `ToolResultParams` — params of `ui/notifications/tool-result`. Carries the §16
 * tool-result shape: content blocks, structured content, an error flag, and
 * `_meta`. (§26.5.2) `content` reuses the S21 {@link ContentBlockSchema}.
 */
export const ToolResultParamsSchema = z
  .object({
    /** OPTIONAL. Content blocks (§14). */
    content: z.array(ContentBlockSchema).optional(),
    /** OPTIONAL. Structured tool result (any JSON value, §16). */
    structuredContent: z.unknown().optional(),
    /** OPTIONAL. Whether the result represents a tool error. */
    isError: z.boolean().optional(),
    /** OPTIONAL. Result metadata. */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ToolResultParams = z.infer<typeof ToolResultParamsSchema>;

/**
 * `ToolCancelledParams` — params of `ui/notifications/tool-cancelled`. (§26.5.2)
 */
export const ToolCancelledParamsSchema = z
  .object({
    /** REQUIRED. Why the associated tool call was cancelled. */
    reason: z.string(),
  })
  .passthrough();

export type ToolCancelledParams = z.infer<typeof ToolCancelledParamsSchema>;

// ─── §26.5.3 — UI → Host request params/results ────────────────────────────────

/**
 * `ToolsCallParams` — params of the UI-initiated `tools/call` request, reusing
 * the core §16 tool-call shape. (§26.5.3)
 */
export const ToolsCallParamsSchema = z
  .object({
    /** REQUIRED. Name of the server tool to invoke. */
    name: z.string(),
    /** OPTIONAL. Arguments for the tool. */
    arguments: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ToolsCallParams = z.infer<typeof ToolsCallParamsSchema>;

/**
 * `OpenLinkParams` — params of `ui/open-link`. Result is an empty object `{}`.
 * (§26.5.3)
 */
export const OpenLinkParamsSchema = z
  .object({
    /** REQUIRED. External link to open. */
    url: z.string(),
  })
  .passthrough();

export type OpenLinkParams = z.infer<typeof OpenLinkParamsSchema>;

/**
 * `UiMessageParams` — params of `ui/message` (insert a message into the
 * conversation). `role` is always `"user"`; `content` is a single text block.
 * Result is an empty object `{}`. (§26.5.3)
 */
export const UiMessageParamsSchema = z
  .object({
    /** REQUIRED. Always `"user"`. */
    role: z.literal('user'),
    /** REQUIRED. The text message content. */
    content: z
      .object({
        type: z.literal('text'),
        text: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

export type UiMessageParams = z.infer<typeof UiMessageParamsSchema>;

/**
 * `RequestDisplayModeParams` — params of `ui/request-display-mode`: the mode the
 * UI requests. (§26.5.3)
 */
export const RequestDisplayModeParamsSchema = z
  .object({
    /** REQUIRED. Display mode the UI requests. */
    mode: UiDisplayModeSchema,
  })
  .passthrough();

export type RequestDisplayModeParams = z.infer<typeof RequestDisplayModeParamsSchema>;

/**
 * `RequestDisplayModeResult` — result of `ui/request-display-mode`: the mode the
 * host ACTUALLY applied, which MAY differ from the requested mode. (§26.5.3,
 * R-26.5.3-e; AC-42.9)
 */
export const RequestDisplayModeResultSchema = z
  .object({
    /** REQUIRED. Display mode the host actually applied (may differ from request). */
    mode: UiDisplayModeSchema,
  })
  .passthrough();

export type RequestDisplayModeResult = z.infer<typeof RequestDisplayModeResultSchema>;

/**
 * `UpdateModelContextParams` — params of `ui/update-model-context` (supply UI
 * content into the model's context). Result is an empty object `{}`. (§26.5.3)
 */
export const UpdateModelContextParamsSchema = z
  .object({
    /** OPTIONAL. Content blocks (§14). */
    content: z.array(ContentBlockSchema).optional(),
    /** OPTIONAL. Structured content (any JSON value, §16). */
    structuredContent: z.unknown().optional(),
  })
  .passthrough();

export type UpdateModelContextParams = z.infer<typeof UpdateModelContextParamsSchema>;

/**
 * `PingParams` — params of `ping` (either direction): an empty object carrying no
 * parameters; the result is likewise an empty object `{}`. (§26.5.3, R-26.5.3-f)
 */
export const PingParamsSchema = z.object({}).passthrough();

export type PingParams = z.infer<typeof PingParamsSchema>;

// ─── §26.5.4 — Host → UI lifecycle / context-change params ─────────────────────

/**
 * `SizeChangedParams` — params of `ui/notifications/size-changed`. (§26.5.4)
 */
export const SizeChangedParamsSchema = z
  .object({
    /** REQUIRED. New container width. */
    width: z.number(),
    /** REQUIRED. New container height. */
    height: z.number(),
  })
  .passthrough();

export type SizeChangedParams = z.infer<typeof SizeChangedParamsSchema>;

/**
 * Params of `ui/notifications/host-context-changed`: a PARTIAL {@link UiHostContext}
 * carrying only the changed members. The same all-OPTIONAL schema validates it,
 * since every host-context member is independently optional. (§26.5.4)
 */
export const HostContextChangedParamsSchema = UiHostContextSchema;

export type HostContextChangedParams = z.infer<typeof HostContextChangedParamsSchema>;

/**
 * `ResourceTeardownParams` — params of the `ui/resource-teardown` request
 * (Host → UI). The UI SHOULD release resources and respond with `{}`. (§26.5.4,
 * R-26.5.4-a; AC-42.11)
 */
export const ResourceTeardownParamsSchema = z
  .object({
    /** REQUIRED. Why the UI is being torn down. */
    reason: z.string(),
  })
  .passthrough();

export type ResourceTeardownParams = z.infer<typeof ResourceTeardownParamsSchema>;

// ─── §26.5.5 — Host-internal sandbox-proxy params ──────────────────────────────

/**
 * `SandboxResourceReadyParams` — params of the host-internal
 * `ui/notifications/sandbox-resource-ready` notification (Host → Sandbox):
 * delivers the resource HTML and the policy to apply. The `csp`/`permissions`
 * shapes are the S41 {@link UiContentSecurityPolicySchema} / {@link UiPermissionsSchema}.
 * (§26.5.5)
 */
export const SandboxResourceReadyParamsSchema = z
  .object({
    /** REQUIRED. The UI document to render. */
    html: z.string(),
    /** OPTIONAL. Sandbox token string to apply, if any. */
    sandbox: z.string().optional(),
    /** OPTIONAL. Effective content-security policy (S41 shape). */
    csp: UiContentSecurityPolicySchema.optional(),
    /** OPTIONAL. Granted permissions (S41 shape). */
    permissions: UiPermissionsSchema.optional(),
  })
  .passthrough();

export type SandboxResourceReadyParams = z.infer<typeof SandboxResourceReadyParamsSchema>;

// ─── §26.5.1 — Handshake ordering (R-26.5.1-a) ──────────────────────────────────

/**
 * The phases of the dialect channel's lifecycle, from the UI's perspective.
 *
 *   - `awaiting-init-response` — the UI has sent (or is about to send)
 *     `ui/initialize` and is waiting for the host's response;
 *   - `initialized` — the response has arrived; the UI may now send
 *     `ui/notifications/initialized` and any subsequent dialect message.
 *
 * The UI MUST NOT issue any other dialect message before the `ui/initialize`
 * response arrives (R-26.5.1-a). {@link uiMayEmitBeforeInitResponse} encodes
 * which messages a conforming UI may emit in the first phase.
 */
export type UiChannelPhase = 'awaiting-init-response' | 'initialized';

/**
 * Returns `true` when a conforming UI MAY emit a dialect message with `method`
 * BEFORE it has received the `ui/initialize` response. Only `ui/initialize`
 * itself qualifies; every other dialect message — including
 * `ui/notifications/initialized` — MUST wait for the response. (§26.5.1,
 * R-26.5.1-a; AC-42.3)
 *
 * `ui/notifications/initialized` is sent only AFTER the response (it is the
 * third step of the handshake), so it returns `false` here.
 *
 * @param method - The method/notification name the UI intends to send.
 */
export function uiMayEmitBeforeInitResponse(method: string): boolean {
  return method === UI_DIALECT_METHODS.INITIALIZE;
}

/** The outcome of a handshake-ordering conformance check. */
export type HandshakeOrderViolation =
  | { ok: true }
  | { ok: false; reason: 'premature-message'; method: string };

/**
 * Conformance check for the handshake-ordering rule (R-26.5.1-a; AC-42.3): given
 * the channel `phase` and the `method` the UI is attempting to send, returns
 * `{ ok: true }` when the message is allowed, or a `premature-message` violation
 * when the UI emits anything other than `ui/initialize` before the init response.
 *
 * @param phase  - The current channel phase from the UI's perspective.
 * @param method - The method/notification name the UI is attempting to send.
 */
export function checkHandshakeOrder(
  phase: UiChannelPhase,
  method: string,
): HandshakeOrderViolation {
  if (phase === 'initialized') {
    return { ok: true };
  }
  if (uiMayEmitBeforeInitResponse(method)) {
    return { ok: true };
  }
  return { ok: false, reason: 'premature-message', method };
}

// ─── §26.7 — Message validation (R-26.7-n, R-26.7-o) ────────────────────────────

/** The outcome of validating an incoming dialect message. */
export type DialectMessageValidation =
  | {
      ok: true;
      kind: UiDialectKind | 'response';
      /** The dialect registry entry when the message names a known dialect method. */
      entry?: UiDialectRegistryEntry;
    }
  | { ok: false; reason: 'malformed-framing' | 'unknown-method'; detail: string };

/**
 * Validates an incoming dialect message against the §3 JSON-RPC framing BEFORE a
 * host acts on it, treating the rendered content as untrusted. (§26.7,
 * R-26.7-n, R-26.7-o; AC-42.18)
 *
 * Steps:
 *   1. Classify the raw value with the S03 {@link classifyMessage} (rejects
 *      batches, bad `jsonrpc`, contradictory members, …). A framing failure is
 *      reported as `malformed-framing` — the host MUST NOT act on it.
 *   2. For requests and notifications, require the `method` to be a verbatim
 *      dialect name (responses carry no method and pass framing-only). An
 *      unrecognized method is reported as `unknown-method`; a receiver MUST then
 *      answer a *request* with method-not-found (R-26.8-c) — see
 *      {@link methodNotFoundResponse}.
 *
 * This never throws: a malformed message yields `{ ok: false, … }` rather than
 * propagating {@link MalformedMessageError}, so a host can branch on the result.
 *
 * @param raw - The raw incoming message value (untrusted).
 */
export function validateDialectMessage(raw: unknown): DialectMessageValidation {
  let classified;
  try {
    classified = classifyMessage(raw);
  } catch (e) {
    const detail = e instanceof MalformedMessageError ? e.message : String(e);
    return { ok: false, reason: 'malformed-framing', detail };
  }

  if (classified.kind === 'result-response' || classified.kind === 'error-response') {
    return { ok: true, kind: 'response' };
  }

  const method = classified.message.method;
  const entry = uiDialectRegistryEntry(method);
  if (entry === undefined) {
    return { ok: false, reason: 'unknown-method', detail: `unknown dialect method "${method}"` };
  }
  return { ok: true, kind: entry.kind, entry };
}

// ─── §26.8 — Error responses ────────────────────────────────────────────────────

/**
 * Builds a JSON-RPC error response for a failed dialect request, per §3 and §22.
 * (§26.8, R-26.8-a; AC-42.19) Reuses the S34 {@link buildErrorObject} so the
 * `error` shape and default messages are the single authoritative ones.
 *
 * @param id      - The request id being answered (echoed verbatim).
 * @param code    - The §22 error code.
 * @param message - OPTIONAL human-readable message; defaults to the registry name.
 * @param data    - OPTIONAL sender-defined additional detail.
 */
export function buildDialectErrorResponse(
  id: JsonRpcId,
  code: number,
  message?: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: buildErrorObject(code, message, data),
  };
}

/**
 * Builds the §22 method-not-found (`-32601`) error response a receiver MUST send
 * when it receives a dialect REQUEST naming a method it does not implement.
 * (§26.8, R-26.8-c; AC-42.21)
 *
 * @param id      - The request id being answered.
 * @param message - OPTIONAL override; defaults to `"Method not found"`.
 */
export function methodNotFoundResponse(
  id: JsonRpcId,
  message = 'Method not found',
): JsonRpcErrorResponse {
  return buildDialectErrorResponse(id, METHOD_NOT_FOUND_CODE, message);
}

/**
 * The set of UI-initiated requests that a host, when it declines them (for lack
 * of consent, policy, or an unknown method), MUST answer with a §22 error rather
 * than silently dropping. (§26.8, R-26.8-b; AC-42.20)
 */
export const DECLINABLE_UI_REQUESTS: readonly UiDialectMethod[] = Object.freeze([
  UI_DIALECT_METHODS.TOOLS_CALL,
  UI_DIALECT_METHODS.RESOURCES_READ,
  UI_DIALECT_METHODS.OPEN_LINK,
  UI_DIALECT_METHODS.MESSAGE,
  UI_DIALECT_METHODS.UPDATE_MODEL_CONTEXT,
]);

/** Why a host declined a UI-initiated request, used to pick the §22 error code. */
export type DeclineReason = 'no-consent' | 'policy' | 'unknown-method' | 'invalid-params';

/**
 * Maps a {@link DeclineReason} to the §22 error code a host returns when it
 * declines a UI-initiated request. (§26.8, R-26.8-b; AC-42.20)
 *
 *   - `unknown-method` → `-32601` Method not found (R-26.8-c);
 *   - `invalid-params` → `-32602` Invalid params;
 *   - `no-consent` / `policy` → `-32603` Internal error (the host refused to act).
 *
 * Whichever reason applies, the host MUST return an error — never a silent drop.
 */
export function declineErrorCode(reason: DeclineReason): number {
  switch (reason) {
    case 'unknown-method':
      return METHOD_NOT_FOUND_CODE;
    case 'invalid-params':
      return INVALID_PARAMS_CODE;
    case 'no-consent':
    case 'policy':
      return INTERNAL_ERROR_CODE;
  }
}

/**
 * Builds the §22 error response a host returns when it DECLINES a UI-initiated
 * request, instead of silently dropping it. The code is selected from `reason`
 * by {@link declineErrorCode}. (§26.8, R-26.8-b; AC-42.20)
 *
 * @param id      - The request id being declined.
 * @param reason  - Why the host declined.
 * @param message - OPTIONAL human-readable message.
 */
export function buildDeclineErrorResponse(
  id: JsonRpcId,
  reason: DeclineReason,
  message?: string,
): JsonRpcErrorResponse {
  return buildDialectErrorResponse(id, declineErrorCode(reason), message);
}

// ─── §26.5.3 / §26.7 — Host mediation & consent gating ──────────────────────────

/**
 * The host's per-request mediation policy inputs for a UI-initiated `tools/call`.
 * A host MUST mediate the request: route it to the server ONLY after obtaining
 * user consent and applying its policy, and SHOULD reject it when the named
 * tool's effective `visibility` does not include `"app"`. (§26.5.3, §26.7,
 * R-26.5.3-a/b, R-26.7-i/j/k; AC-42.5, AC-42.6)
 */
export interface ToolsCallMediationInput {
  /** The tool's UI declaration (S41 `_meta.ui`), or `undefined` if it has none. */
  readonly uiMeta: Pick<ToolUiMeta, 'visibility'> | undefined;
  /** Whether the user has granted consent for this invocation. (R-26.7-j) */
  readonly userConsented: boolean;
  /** Whether the host's tool-execution policy permits this invocation. (R-26.7-j) */
  readonly policyAllows: boolean;
}

/** The decision a host reaches for a UI-initiated `tools/call`. */
export type ToolsCallMediationDecision =
  | { route: true }
  | { route: false; reason: DeclineReason };

/**
 * Decides whether a host may route a UI-initiated `tools/call` to the server.
 * (§26.5.3, §26.7, R-26.5.3-a, R-26.5.3-b, R-26.7-i, R-26.7-j, R-26.7-k; AC-42.5,
 * AC-42.6)
 *
 * The host routes the call ONLY when ALL hold, in this precedence:
 *   1. the tool's effective `visibility` includes `"app"` (SHOULD reject
 *      otherwise — reuses S41 {@link hostShouldRejectUiOriginatedCall}); a
 *      rejection here is a `policy` decline;
 *   2. the host's tool-execution policy permits the call (`policy` decline);
 *   3. the user has consented (`no-consent` decline).
 *
 * A path that reaches the server WITHOUT prior consent and policy is a failure
 * (AC-42.5): this function returns `route: false` in every such case, and the
 * caller MUST answer with the corresponding §22 error (never a silent drop).
 */
export function mediateUiToolsCall(input: ToolsCallMediationInput): ToolsCallMediationDecision {
  // R-26.7-k / R-26.5.3-b: reject when effective visibility excludes "app".
  if (hostShouldRejectUiOriginatedCall(input.uiMeta)) {
    return { route: false, reason: 'policy' };
  }
  // R-26.7-j: the host's tool-execution policy MUST permit the call.
  if (!input.policyAllows) {
    return { route: false, reason: 'policy' };
  }
  // R-26.7-j: user consent MUST be obtained before routing.
  if (!input.userConsented) {
    return { route: false, reason: 'no-consent' };
  }
  return { route: true };
}

/**
 * Decides whether a host may honor a `ui/open-link` request. The host MAY decline
 * and SHOULD confirm with the user before honoring it; a non-confirming auto-open
 * is a conformance failure. (§26.5.3, §26.7, R-26.5.3-d, R-26.7-l; AC-42.8)
 *
 * Returns `route: true` only when the host both chose to honor the request AND
 * obtained the user's confirmation; otherwise a `policy` (host declined) or
 * `no-consent` (no confirmation) decline.
 *
 * @param hostHonors      - Whether the host chooses to honor the request (MAY decline).
 * @param userConfirmed   - Whether the user confirmed opening the link (SHOULD confirm).
 */
export function mediateOpenLink(
  hostHonors: boolean,
  userConfirmed: boolean,
): ToolsCallMediationDecision {
  if (!hostHonors) {
    return { route: false, reason: 'policy' };
  }
  if (!userConfirmed) {
    return { route: false, reason: 'no-consent' };
  }
  return { route: true };
}

/**
 * Decides whether a host may honor a `ui/message` insertion. The host SHOULD
 * confirm with the user before inserting the message into the conversation.
 * (§26.7, R-26.7-l; AC-42.20) Same gate shape as {@link mediateOpenLink}.
 *
 * @param hostHonors    - Whether the host chooses to honor the request.
 * @param userConfirmed - Whether the user confirmed inserting the message.
 */
export function mediateUiMessage(
  hostHonors: boolean,
  userConfirmed: boolean,
): ToolsCallMediationDecision {
  return mediateOpenLink(hostHonors, userConfirmed);
}

/**
 * Applies a `ui/request-display-mode` request: the host MAY grant a mode
 * different from the one requested, and the result reports the mode actually
 * applied. (§26.5.3, R-26.5.3-e; AC-42.9)
 *
 * @param requested - The mode the UI requested.
 * @param applied   - The mode the host actually applies (MAY differ).
 */
export function buildDisplayModeResult(
  _requested: UiDisplayMode,
  applied: UiDisplayMode,
): RequestDisplayModeResult {
  return { mode: applied };
}

/**
 * Builds the prompt success response to a `ping`: an empty result `{}`. The
 * receiver MUST respond promptly so the sender can confirm the peer is live.
 * (§26.5.3, R-26.5.3-f, R-26.5.3-g; AC-42.10)
 *
 * @param id - The `ping` request id being answered.
 */
export function buildPingResponse(id: JsonRpcId): {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: Record<string, never>;
} {
  return { jsonrpc: '2.0', id, result: {} };
}

/**
 * Builds the empty `{}` success response a UI returns to a `ui/resource-teardown`
 * request after releasing its resources. (§26.5.4, R-26.5.4-a; AC-42.11)
 *
 * @param id - The teardown request id being answered.
 */
export function buildTeardownResponse(id: JsonRpcId): {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: Record<string, never>;
} {
  return { jsonrpc: '2.0', id, result: {} };
}

// ─── §26.7 — Sandbox CSP / permission enforcement ───────────────────────────────

/**
 * Computes the GRANTED permission set for a UI resource, enforcing R-26.7-h:
 * the host MUST NOT grant any permission the resource did not request, and MAY
 * decline a requested one. The result is exactly what
 * `hostCapabilities.sandbox.permissions` reports. (§26.7, R-26.7-h; AC-42.15,
 * AC-42.16)
 *
 * Starts from the resource's requested set (S41 `permissions`), keeps only
 * members the resource requested, and drops any the host chose to decline.
 *
 * @param requested - The resource's declared `permissions` (S41), or `undefined`.
 * @param declined  - The subset of requested permissions the host declines
 *   (the host's own R-26.7-h choice); members not requested are ignored.
 */
export function grantedPermissions(
  requested: UiPermissions | undefined,
  declined: Iterable<string> = [],
): UiPermissions {
  const declineSet = new Set<string>(declined);
  const granted: Record<string, unknown> = {};
  if (requested !== undefined) {
    for (const [name, value] of Object.entries(requested)) {
      if (value === undefined) continue; // not requested
      if (declineSet.has(name)) continue; // host declined (MAY)
      granted[name] = value;
    }
  }
  return granted as UiPermissions;
}

/**
 * Builds the `hostCapabilities.sandbox` report for the initialize result: the
 * EFFECTIVE CSP the host applied and the GRANTED permission set. The CSP is
 * resolved via the S41 {@link resolveCsp} (declared `csp`, else deny-by-default),
 * and the permissions via {@link grantedPermissions}. (§26.7, R-26.7-g,
 * R-26.7-h; AC-42.15)
 *
 * @param effectiveCsp - The effective CSP the host applied (e.g. from
 *   S41 `resolveCsp`); reported verbatim under `sandbox.csp`.
 * @param granted      - The granted permission set (e.g. from
 *   {@link grantedPermissions}); reported verbatim under `sandbox.permissions`.
 */
export function buildSandboxReport(
  effectiveCsp: UiContentSecurityPolicy,
  granted: UiPermissions,
): UiSandboxReport {
  return { csp: effectiveCsp, permissions: granted };
}

// ─── §26.7 — Data-exposure guard (R-26.7-m) ─────────────────────────────────────

/**
 * The keys a host MUST NOT expose to the UI: credentials, authorization tokens
 * (§23), and unrelated conversation/context data. Only the tool input/result the
 * UI was rendered for and host context delivered through the dialect are
 * permitted. (§26.7, R-26.7-m; AC-42.17)
 *
 * This list is illustrative of the categories a host must withhold; the
 * authoritative rule is the inclusion test {@link uiExposureIsClean}, which keys
 * off an allow-list rather than a deny-list.
 */
export const FORBIDDEN_UI_EXPOSURE_KEYS: readonly string[] = Object.freeze([
  'credentials',
  'authorization',
  'authorizationToken',
  'accessToken',
  'token',
  'apiKey',
  'cookies',
  'conversation',
  'conversationHistory',
]);

/**
 * The ONLY data categories a host MAY make available to the rendered UI: the
 * tool input and result it was rendered for, and host context explicitly
 * delivered through the dialect. (§26.7, R-26.7-m; AC-42.17)
 */
export const ALLOWED_UI_EXPOSURE_KEYS: readonly string[] = Object.freeze([
  'toolInput',
  'toolResult',
  'hostContext',
]);

/**
 * Returns `true` when the data a host is about to expose to the UI contains ONLY
 * permitted categories — every top-level key is in {@link ALLOWED_UI_EXPOSURE_KEYS}.
 * Any other key (a credential, token, cookie, or unrelated conversation/context
 * datum) makes the exposure dirty. (§26.7, R-26.7-m; AC-42.17)
 *
 * The check is allow-list based (not merely "no forbidden key present"), so an
 * unforeseen leaking key is caught too.
 *
 * @param exposed - The object a host intends to hand to the UI.
 */
export function uiExposureIsClean(exposed: Record<string, unknown>): boolean {
  const allowed = new Set(ALLOWED_UI_EXPOSURE_KEYS);
  return Object.keys(exposed).every((k) => allowed.has(k));
}

// ─── §26.7 — Sandbox isolation model (declarative; R-26.7-a/b/c) ─────────────────

/**
 * The access categories a sandboxed UI MUST be denied: the embedding document's
 * DOM, cookies, storage, and navigation. The rendered content MUST NOT be able
 * to escape the sandbox to reach host or user state. (§26.7, R-26.7-a, R-26.7-b;
 * AC-42.12) A host renders the UI in an isolated browsing context that blocks
 * every one of these.
 */
export const SANDBOX_DENIED_ACCESS: readonly string[] = Object.freeze([
  'dom',
  'cookies',
  'storage',
  'navigation',
]);

/**
 * Returns `true` when a proposed sandbox configuration is conforming: it denies
 * EVERY category in {@link SANDBOX_DENIED_ACCESS}, leaving the §26.5 dialect
 * channel as the only path between the UI and the host (R-26.7-c). (§26.7,
 * R-26.7-a, R-26.7-b, R-26.7-c; AC-42.12, AC-42.13)
 *
 * @param deniedAccess - The access categories the sandbox denies.
 */
export function sandboxIsolationIsConforming(deniedAccess: Iterable<string>): boolean {
  const denied = new Set(deniedAccess);
  return SANDBOX_DENIED_ACCESS.every((cat) => denied.has(cat));
}

/**
 * Returns `true` when the §26.5 dialect channel is the ONLY path granted between
 * the rendered UI and the host — i.e. no other ambient path to host or user data
 * exists. The host MUST NOT grant ambient access through any other path.
 * (§26.7, R-26.7-c; AC-42.13)
 *
 * @param grantedPaths - The set of paths the host grants the UI to reach host/
 *   user data. Conforming hosts grant exactly the dialect channel.
 */
export function dialectIsOnlyChannel(grantedPaths: Iterable<string>): boolean {
  const paths = [...grantedPaths];
  return paths.length === 1 && paths[0] === DIALECT_CHANNEL_PATH;
}

/** The single permitted path between UI and host: the §26.5 dialect channel. (R-26.7-c) */
export const DIALECT_CHANNEL_PATH = 'ui-dialect-channel' as const;

// ─── §26.9 — SDK scope summary ──────────────────────────────────────────────────

/**
 * The server-side obligations of this extension. A server-side implementation
 * MUST support all three. (§26.9, R-26.9-a, R-26.9-b, R-26.9-c; AC-42.22–AC-42.24)
 *
 *   - `acknowledge-extension` — acknowledge `io.modelcontextprotocol/ui` in the
 *     `server/discover` result when the host advertises it (R-26.9-a);
 *   - `declare-ui-meta`       — declare the UI association via `_meta.ui` with
 *     `resourceUri` and OPTIONAL `visibility` (R-26.9-b);
 *   - `serve-ui-resource`     — serve the `ui://` resource via `resources/read`
 *     with the `text/html;profile=mcp-app` MIME type (R-26.9-c).
 */
export const SERVER_SDK_OBLIGATIONS = [
  'acknowledge-extension',
  'declare-ui-meta',
  'serve-ui-resource',
] as const;

export type ServerSdkObligation = (typeof SERVER_SDK_OBLIGATIONS)[number];

/**
 * The host/client-only concerns that are NOT obligations of a server SDK:
 * rendering, sandboxing, CSP/permission enforcement, running the dialect
 * runtime, and obtaining user consent. (§26.9, R-26.9-d; AC-42.25)
 */
export const HOST_ONLY_CONCERNS = [
  'render-sandboxed',
  'enforce-csp-permissions',
  'run-dialect-runtime',
  'obtain-consent',
] as const;

export type HostOnlyConcern = (typeof HOST_ONLY_CONCERNS)[number];

/**
 * Returns `true` when `concern` is a SERVER-SDK obligation under this extension
 * (one of {@link SERVER_SDK_OBLIGATIONS}); returns `false` for any host-only
 * concern. A server-SDK conformance check uses this to confirm that sandboxing,
 * CSP/permission enforcement, the dialect runtime, and consent are NOT required
 * of the server SDK. (§26.9, R-26.9-d; AC-42.25)
 *
 * @param concern - A server obligation or host-only concern name.
 */
export function isServerSdkObligation(
  concern: ServerSdkObligation | HostOnlyConcern | string,
): concern is ServerSdkObligation {
  return (SERVER_SDK_OBLIGATIONS as readonly string[]).includes(concern);
}

// Re-export the convenience error object type alias so callers building dialect
// error responses do not need a second import from S34.
export type { JsonRpcErrorObject, JsonRpcErrorResponse, JsonRpcId };
