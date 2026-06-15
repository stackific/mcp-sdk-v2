/**
 * QA follow-ups for Wave 9 (S24 / S26 / S28):
 *
 *  - S24 RQ-21 (R-16.4-o) / RQ-22 (R-16.4-p): the SDK validates a JSON *value*
 *    against a tool's `inputSchema` (`tools/call` arguments) and a
 *    `structuredContent` value against an `outputSchema`.
 *  - S24 RQ-12 (R-16.2-m): `ListToolsResultSchema.resultType` is fixed to
 *    `"complete"`; any other value (e.g. `"input_required"`) is rejected.
 *  - S26 RQ-8 (R-17.2-f / R-17.3-c): the two resource list-result schemas fix
 *    `resultType` to `"complete"`.
 *  - S28 (R-18.2-n, same class): `ListPromptsResultSchema` fixes it likewise.
 */

import { describe, it, expect } from 'vitest';
import {
  validateValueAgainstSchema,
  validateToolArguments,
  validateToolStructuredContent,
  ListToolsResultSchema,
} from '../../protocol/tools.js';
import {
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
} from '../../protocol/resources.js';
import { ListPromptsResultSchema } from '../../protocol/prompts.js';

// ─── RQ-21 / RQ-22 — JSON Schema value validation ───────────────────────────────

const stringLocationSchema = {
  type: 'object',
  properties: { location: { type: 'string' } },
  required: ['location'],
  additionalProperties: false,
};

describe('validateToolArguments — arguments validated against inputSchema (RQ-21 · R-16.4-o)', () => {
  const tool = { inputSchema: stringLocationSchema };

  it('rejects { location: 42 } when a string is required', () => {
    const result = validateToolArguments(tool, { location: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/string/i);
  });

  it('accepts { location: "New York" }', () => {
    expect(validateToolArguments(tool, { location: 'New York' })).toEqual({ valid: true, errors: [] });
  });

  it('rejects a missing required property', () => {
    expect(validateToolArguments(tool, {}).valid).toBe(false);
  });

  it('rejects an unexpected property under additionalProperties:false', () => {
    expect(validateToolArguments(tool, { location: 'NYC', extra: 1 }).valid).toBe(false);
  });

  it('validates against the 2020-12 default dialect without an explicit $schema', () => {
    // no $schema present → 2020-12 is assumed and used
    expect(validateToolArguments({ inputSchema: { type: 'object' } }, {}).valid).toBe(true);
  });
});

describe('validateToolStructuredContent — validated against outputSchema (RQ-22 · R-16.4-p)', () => {
  const outputSchema = {
    type: 'object',
    properties: { rows: { type: 'integer' } },
    required: ['rows'],
  };

  it('is valid (nothing to check) when the tool declares no outputSchema', () => {
    expect(validateToolStructuredContent({ inputSchema: {} }, { anything: true })).toEqual({ valid: true, errors: [] });
  });

  it('accepts a conforming structuredContent', () => {
    expect(validateToolStructuredContent({ inputSchema: {}, outputSchema }, { rows: 3 }).valid).toBe(true);
  });

  it('rejects a non-conforming structuredContent', () => {
    const result = validateToolStructuredContent({ inputSchema: {}, outputSchema }, { rows: 'three' });
    expect(result.valid).toBe(false);
  });
});

describe('validateValueAgainstSchema — refusals (never throws)', () => {
  it('refuses a non-object schema', () => {
    expect(validateValueAgainstSchema(null, {}).valid).toBe(false);
    expect(validateValueAgainstSchema('nope', {}).valid).toBe(false);
  });

  it('refuses an unsupported dialect rather than treating it as permissive', () => {
    const result = validateValueAgainstSchema(
      { $schema: 'https://json-schema.org/draft-04/schema#', type: 'string' },
      42,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/dialect/i);
  });

  it('tolerates MCP annotation keywords (x-mcp-header) without throwing', () => {
    const schema = {
      type: 'object',
      properties: { region: { type: 'string', 'x-mcp-header': 'Region' } },
      required: ['region'],
    };
    expect(validateValueAgainstSchema(schema, { region: 'us-west1' }).valid).toBe(true);
    expect(validateValueAgainstSchema(schema, { region: 9 }).valid).toBe(false);
  });
});

// ─── RQ-12 / RQ-8 / S28 — list resultType fixed to "complete" ────────────────────

const toolsListBase = { tools: [], ttlMs: 0, cacheScope: 'public' as const };
const resourcesListBase = { resources: [], ttlMs: 0, cacheScope: 'public' as const };
const templatesListBase = { resourceTemplates: [], ttlMs: 0, cacheScope: 'public' as const };
const promptsListBase = { prompts: [], ttlMs: 0, cacheScope: 'public' as const };

describe('list results fix resultType to "complete" (RQ-12 · RQ-8 · R-16.2-m / R-17.2-f / R-17.3-c / R-18.2-n)', () => {
  it('ListToolsResultSchema accepts "complete", rejects "input_required" and other values', () => {
    expect(ListToolsResultSchema.safeParse({ resultType: 'complete', ...toolsListBase }).success).toBe(true);
    expect(ListToolsResultSchema.safeParse({ resultType: 'input_required', ...toolsListBase }).success).toBe(false);
    expect(ListToolsResultSchema.safeParse({ resultType: 'partial', ...toolsListBase }).success).toBe(false);
  });

  it('ListResourcesResultSchema rejects a non-complete resultType', () => {
    expect(ListResourcesResultSchema.safeParse({ resultType: 'complete', ...resourcesListBase }).success).toBe(true);
    expect(ListResourcesResultSchema.safeParse({ resultType: 'input_required', ...resourcesListBase }).success).toBe(false);
  });

  it('ListResourceTemplatesResultSchema rejects a non-complete resultType', () => {
    expect(ListResourceTemplatesResultSchema.safeParse({ resultType: 'complete', ...templatesListBase }).success).toBe(true);
    expect(ListResourceTemplatesResultSchema.safeParse({ resultType: 'input_required', ...templatesListBase }).success).toBe(false);
  });

  it('ListPromptsResultSchema rejects a non-complete resultType', () => {
    expect(ListPromptsResultSchema.safeParse({ resultType: 'complete', ...promptsListBase }).success).toBe(true);
    expect(ListPromptsResultSchema.safeParse({ resultType: 'input_required', ...promptsListBase }).success).toBe(false);
  });
});
