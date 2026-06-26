/**
 * Cliente DeepSeek (API compatible con OpenAI).
 * Context caching: prompt estable al inicio → más CACHE HIT (ver api-docs.deepseek.com/guides/kv_cache).
 */
import OpenAI from 'openai';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

let deepseekClient = null;

export function isDeepSeekConfigured() {
  return Boolean(DEEPSEEK_API_KEY);
}

export function getDeepSeekClient() {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('Falta DEEPSEEK_API_KEY');
  }
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
    });
  }
  return deepseekClient;
}

export function getDeepSeekModel() {
  return DEEPSEEK_MODEL;
}

function logUsage(logFn, event, usage = {}, extra = {}) {
  if (typeof logFn !== 'function') return;
  logFn(event, {
    model: DEEPSEEK_MODEL,
    prompt_cache_hit_tokens: usage.prompt_cache_hit_tokens ?? 0,
    prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    prompt_tokens: usage.prompt_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
    ...extra,
  });
}

/**
 * Chat completion con logging de cache hit/miss.
 * Mantener `systemPrompt` idéntico entre llamadas para maximizar CACHE HIT.
 */
export async function deepseekChatCompletion({
  systemPrompt,
  userContent,
  historyMessages = [],
  maxTokens = 320,
  jsonMode = false,
  logFn = null,
  purpose = 'chat',
}) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userContent },
  ];

  const request = {
    model: DEEPSEEK_MODEL,
    messages,
    max_tokens: maxTokens,
    stream: false,
  };

  if (jsonMode) {
    request.response_format = { type: 'json_object' };
  }

  const completion = await getDeepSeekClient().chat.completions.create(request);
  const usage = completion.usage || {};
  logUsage(logFn, 'deepseek_cache_usage', usage, { purpose });

  return {
    content: completion.choices[0]?.message?.content?.trim() || '',
    usage,
  };
}
