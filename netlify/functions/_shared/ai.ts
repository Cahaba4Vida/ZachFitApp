import { z } from 'zod';

const OpenAIResponseSchema = z.object({
  output: z.array(z.any()).optional(),
  output_text: z.string().optional()
}).passthrough();

export type OpenAIClientOpts = {
  model: string;
  apiKey: string;
};

export async function callResponsesAPI(input: any, instructions: string, opts: OpenAIClientOpts): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: opts.model,
      instructions,
      input,
      // do not store user data on provider side by default
      store: false
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const parsed = OpenAIResponseSchema.parse(json);
  // The REST response includes output_text helper in SDK; in raw REST it is usually present as output_text.
  if (parsed.output_text && typeof parsed.output_text === 'string') return parsed.output_text;
  // Fallback: try to extract from output items
  const out = (json.output || []) as any[];
  for (const item of out) {
    if (item?.type === 'message' && Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (c?.type === 'output_text' && typeof c?.text === 'string') return c.text;
        if (typeof c?.text === 'string') return c.text;
      }
    }
  }
  return JSON.stringify(json);
}

export function oneSentence(s: string): string {
  const trimmed = (s || '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(/(?<=[.!?])\s+/)[0];
  // If no punctuation, hard cap.
  return (first || trimmed).slice(0, 240).trim();
}

export function extractJsonBlock(text: string): any {
  const t = text.trim();
  const fence = /```json\s*([\s\S]*?)```/i.exec(t);
  const raw = fence ? fence[1] : t;
  // try find first { ... } block
  const m = raw.match(/\{[\s\S]*\}/);
  const candidate = m ? m[0] : raw;
  return JSON.parse(candidate);
}
