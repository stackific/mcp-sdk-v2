/**
 * S8 — MCP Apps / Interactive UI extension helpers (§26). Build a `ui://` resource
 * and a launcher tool result that embeds it and declares the UI under the spec
 * `_meta.ui` key, which a host renders in a sandboxed iframe. Edge-safe (pure
 * shaping). Built on the conformant `protocol/ui.ts` primitives:
 *   - the UI resource MIME is the verbatim `text/html;profile=mcp-app` (§26.4);
 *   - the declaration lives at `_meta.ui` as `{ resourceUri, visibility? }` (§26.3);
 *   - the resource URI MUST use the `ui://` scheme.
 */
import {
  UI_MIME_TYPE,
  UI_URI_SCHEME,
  TOOL_UI_META_KEY,
  isUiResourceUri,
  type UiVisibility,
} from '../protocol/ui.js';

/** An embedded `ui://` resource content block with the verbatim UI MIME type. (§26.4) */
export function uiResource(uri: string, html: string): { uri: string; mimeType: string; text: string } {
  if (!isUiResourceUri(uri)) {
    throw new Error(`MCP App resource URI must use the ${UI_URI_SCHEME} scheme: "${uri}"`);
  }
  return { uri, mimeType: UI_MIME_TYPE, text: html };
}

/** Options for {@link uiToolResult}. */
export interface UiToolResultOptions {
  /** Leading text content block (a human-readable note). */
  text?: string;
  /** Which actors may invoke the tool; omitted ⇒ `["model","app"]`. (§26.3) */
  visibility?: UiVisibility[];
}

/**
 * Builds a tool result that launches an MCP App: it embeds the `ui://` resource
 * (with the `text/html;profile=mcp-app` MIME) and declares the UI under the
 * `_meta.ui` key as `{ resourceUri, visibility? }` per the Apps extension. (§26.3)
 */
export function uiToolResult(uri: string, html: string, options: UiToolResultOptions = {}): {
  content: unknown[];
  _meta: Record<string, unknown>;
} {
  const resource = uiResource(uri, html);
  return {
    content: [
      ...(options.text ? [{ type: 'text', text: options.text }] : []),
      { type: 'resource', resource },
    ],
    _meta: {
      [TOOL_UI_META_KEY]: {
        resourceUri: uri,
        ...(options.visibility ? { visibility: options.visibility } : {}),
      },
    },
  };
}
