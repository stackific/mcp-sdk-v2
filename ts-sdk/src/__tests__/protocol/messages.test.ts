/**
 * Tests for abstract message-kind schemas and predicates — S01 §1.2, §2.2.
 *
 * AC coverage:
 *  AC-01.5  (R-2.2-c)  — request and notification are mutually exclusive kinds
 *  AC-01.6  (R-2.2-d)  — request requires id + method; params optional
 *  AC-01.7  (R-2.2-e)  — notification requires method, has no id; no response sent
 *  AC-01.17 (R-2.1-a)  — MUST: notification schema ALWAYS rejects missing method
 *  AC-01.18 (R-2.1-b)  — MUST NOT: isNotification NEVER returns true when id present
 *  AC-01.21 (R-2.1-e)  — MAY: params absence is valid for both kinds
 *  AC-01.23 (R-2.1-g)  — core message patterns (request/notification schemas) exist
 */

import { describe, it, expect } from 'vitest';
import {
  RequestSchema,
  NotificationSchema,
  ErrorPayloadSchema,
  isRequest,
  isNotification,
} from '../../protocol/messages.js';

describe('RequestSchema (AC-01.6 — R-2.2-d)', () => {
  it('parses a request with id and method (params optional)', () => {
    expect(RequestSchema.safeParse({ id: 1, method: 'tools/list' }).success).toBe(true);
  });

  it('parses with numeric id, method, and params', () => {
    const result = RequestSchema.safeParse({
      id: 42,
      method: 'resources/read',
      params: { uri: 'file:///readme.txt' },
    });
    expect(result.success).toBe(true);
  });

  it('parses with a string id', () => {
    expect(RequestSchema.safeParse({ id: 'req-1', method: 'prompts/list' }).success).toBe(true);
  });

  it('parses with null id (valid JSON-RPC)', () => {
    expect(RequestSchema.safeParse({ id: null, method: 'ping' }).success).toBe(true);
  });

  it('rejects when id is absent', () => {
    expect(RequestSchema.safeParse({ method: 'tools/list' }).success).toBe(false);
  });

  it('rejects when method is absent', () => {
    expect(RequestSchema.safeParse({ id: 1 }).success).toBe(false);
  });

  it('passes through extra fields (e.g. jsonrpc from S03)', () => {
    const result = RequestSchema.safeParse({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(result.success).toBe(true);
  });
});

describe('NotificationSchema (AC-01.7 — R-2.2-e)', () => {
  it('parses a notification with method only', () => {
    expect(
      NotificationSchema.safeParse({ method: 'notifications/progress' }).success,
    ).toBe(true);
  });

  it('parses a notification with method and params', () => {
    expect(
      NotificationSchema.safeParse({
        method: 'notifications/cancelled',
        params: { requestId: 1 },
      }).success,
    ).toBe(true);
  });

  /**
   * AC-01.7, AC-01.17 (MUST = absolute): the schema MUST always require method;
   * there is no input for which a methodless object is a valid notification.
   */
  it('rejects when method is absent (MUST require method — AC-01.17)', () => {
    expect(NotificationSchema.safeParse({ params: {} }).success).toBe(false);
    expect(NotificationSchema.safeParse({}).success).toBe(false);
  });

  it('notification schema shape does not define an id field', () => {
    expect('id' in NotificationSchema.shape).toBe(false);
  });

  it('passes through extra fields (e.g. jsonrpc from S03)', () => {
    expect(
      NotificationSchema.safeParse({ jsonrpc: '2.0', method: 'notifications/progress' }).success,
    ).toBe(true);
  });
});

describe('isRequest / isNotification predicates (AC-01.5, AC-01.6, AC-01.7)', () => {
  it('isRequest returns true when id is present', () => {
    expect(isRequest({ id: 1, method: 'tools/list' })).toBe(true);
  });

  it('isRequest returns false when id is absent', () => {
    expect(isRequest({ method: 'notifications/progress' })).toBe(false);
  });

  it('isNotification returns true when method present and id absent', () => {
    expect(isNotification({ method: 'notifications/progress' })).toBe(true);
  });

  it('isNotification returns false when id is present', () => {
    expect(isNotification({ id: 1, method: 'tools/list' })).toBe(false);
  });

  it('isNotification returns false when method is absent', () => {
    expect(isNotification({ params: {} })).toBe(false);
  });

  /**
   * AC-01.5 (R-2.2-c): A request requires exactly one response; a notification
   * requires none. The two kinds are mutually exclusive — a single object can
   * satisfy at most one predicate, never both.
   *
   * AC-01.18 (R-2.1-b — MUST NOT): isNotification MUST NEVER return true for
   * an object that has an id, under any input.
   */
  it('request and notification are mutually exclusive (AC-01.5, AC-01.18)', () => {
    const withId = { id: 1, method: 'tools/list' };
    const withoutId = { method: 'notifications/progress' };

    expect(isRequest(withId) && isNotification(withId)).toBe(false);
    expect(isRequest(withoutId) && isNotification(withoutId)).toBe(false);
  });

  /**
   * AC-01.21 (R-2.1-e — MAY): params absence is valid for both kinds.
   * Both kind predicates work regardless of whether params is present.
   */
  it('params absence is valid for both kinds (AC-01.21)', () => {
    expect(isRequest({ id: 1, method: 'ping' })).toBe(true);
    expect(isNotification({ method: 'ping' })).toBe(true);
  });
});

describe('ErrorPayloadSchema (§2.2)', () => {
  it('parses error with code and message', () => {
    expect(ErrorPayloadSchema.safeParse({ code: -32600, message: 'Invalid Request' }).success).toBe(true);
  });

  it('parses error with optional data', () => {
    expect(
      ErrorPayloadSchema.safeParse({ code: -32700, message: 'Parse error', data: { raw: '...' } }).success,
    ).toBe(true);
  });

  it('rejects when code is absent', () => {
    expect(ErrorPayloadSchema.safeParse({ message: 'oops' }).success).toBe(false);
  });

  it('rejects when message is absent', () => {
    expect(ErrorPayloadSchema.safeParse({ code: -32600 }).success).toBe(false);
  });

  it('rejects a non-integer code', () => {
    expect(ErrorPayloadSchema.safeParse({ code: 1.5, message: 'bad' }).success).toBe(false);
  });
});
