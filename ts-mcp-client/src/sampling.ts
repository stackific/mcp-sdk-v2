import Anthropic from '@anthropic-ai/sdk';

import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, HAS_KEY } from './config.js';

type ContentBlock = { type: string; text?: string; [k: string]: unknown };

export interface SampleParams {
  messages: { role: 'user' | 'assistant'; content: ContentBlock | ContentBlock[] }[];
  maxTokens?: number;
  systemPrompt?: string;
}

export interface SampleResult {
  role: 'assistant';
  content: { type: 'text'; text: string };
  model: string;
  stopReason: string;
}

function contentToText(content: ContentBlock | ContentBlock[] | undefined): string {
  const blocks = Array.isArray(content) ? content : content ? [content] : [];
  return blocks
    .map((b) =>
      b && b.type === 'text' && typeof b.text === 'string'
        ? b.text
        : `[${b?.type ?? 'unknown'} content]`,
    )
    .join('\n');
}

/** DeepSeek via its Anthropic-compatible endpoint (the real path when DEEPSEEK_API_KEY is set). */
async function sampleWithDeepSeek(params: SampleParams): Promise<SampleResult> {
  const client = new Anthropic({ apiKey: DEEPSEEK_API_KEY, baseURL: DEEPSEEK_BASE_URL });
  const resp = await client.messages.create({
    model: DEEPSEEK_MODEL,
    max_tokens: params.maxTokens ?? 512,
    system: params.systemPrompt,
    messages: params.messages.map((m) => ({ role: m.role, content: contentToText(m.content) })),
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return {
    role: 'assistant',
    content: { type: 'text', text },
    model: resp.model,
    stopReason: resp.stop_reason ?? 'endTurn',
  };
}

/** Deterministic stand-in so Sampling works before a key is configured. */
function sampleMock(params: SampleParams): SampleResult {
  const lastUser = [...params.messages].reverse().find((m) => m.role === 'user');
  const said = contentToText(lastUser?.content).replace(/\s+/g, ' ').trim();
  const gist = said.split(' ').slice(0, 16).join(' ');
  return {
    role: 'assistant',
    content: {
      type: 'text',
      text: `(mock model — set DEEPSEEK_API_KEY in backend/.env for a real DeepSeek answer)\nIn short: ${gist}${said.split(' ').length > 16 ? '…' : ''}`,
    },
    model: 'mock-deepseek',
    stopReason: 'endTurn',
  };
}

export async function sample(params: SampleParams): Promise<SampleResult> {
  return HAS_KEY ? sampleWithDeepSeek(params) : sampleMock(params);
}
