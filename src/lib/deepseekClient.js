/**
 * Cliente DeepSeek (API compatible con OpenAI).
 * Context caching: prompt estable al inicio → más CACHE HIT.
 * WhatsApp (Pro): Responses API con tools + json_schema; fallback a Chat Completions.
 *
 * Flash: normalización de direcciones y tareas baratas.
 * Pro: clasificación de intención de viaje (dueño del intent).
 */
import OpenAI from 'openai';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
export const DEEPSEEK_FLASH_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
export const DEEPSEEK_PRO_MODEL = process.env.DEEPSEEK_PRO_MODEL || 'deepseek-v4-pro';

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
  return DEEPSEEK_FLASH_MODEL;
}

export function getDeepSeekProModel() {
  return DEEPSEEK_PRO_MODEL;
}

function logUsage(logFn, event, usage = {}, extra = {}) {
  if (typeof logFn !== 'function') return;
  logFn(event, {
    model: extra.model || DEEPSEEK_FLASH_MODEL,
    prompt_cache_hit_tokens: usage.prompt_cache_hit_tokens ?? 0,
    prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    prompt_tokens: usage.prompt_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
    ...extra,
  });
}

export function normalizeReasoningEffort(value) {
  const v = String(value || 'none').toLowerCase();
  if (v === 'low' || v === 'high') return v;
  return 'none';
}

export function toolsForChatCompletions(tools = []) {
  return (tools || [])
    .map((tool) => {
      if (tool?.type === 'function' && tool.function?.name) return tool;
      if (tool?.type === 'function' && tool.name) {
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || { type: 'object', properties: {} },
          },
        };
      }
      return null;
    })
    .filter(Boolean);
}

export function buildResponsesTextFormat(jsonSchema = null) {
  if (jsonSchema?.schema) {
    return {
      format: {
        type: 'json_schema',
        name: jsonSchema.name || 'result',
        schema: jsonSchema.schema,
        strict: false,
      },
    };
  }
  return { format: { type: 'json_object' } };
}

export function usageFromResponsesApi(usage = {}) {
  return {
    prompt_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    completion_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
    prompt_cache_hit_tokens: usage.input_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0,
    prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens ?? 0,
  };
}

export function extractResponsesOutputText(response) {
  if (response?.output_text) return String(response.output_text);
  const texts = [];
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content || []) {
      if ((part.type === 'output_text' || part.type === 'text') && part.text) {
        texts.push(part.text);
      }
    }
  }
  return texts.join('\n');
}

export function functionCallsFromResponse(response) {
  return (response?.output || []).filter((item) => item?.type === 'function_call');
}

function parseToolArgs(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function toolCallsFromChatMessage(message) {
  return Array.isArray(message?.tool_calls) ? message.tool_calls : [];
}

async function runToolSafe(runTool, name, args) {
  try {
    return await runTool(name, args);
  } catch (err) {
    return { error: err?.message || 'tool_failed' };
  }
}

/**
 * Chat completion con logging de cache hit/miss.
 * Mantener `systemPrompt` idéntico entre llamadas para maximizar CACHE HIT.
 * JSON de pedido: reasoning.effort none (thinking apagado).
 */
export async function deepseekChatCompletion({
  systemPrompt,
  userContent,
  historyMessages = [],
  messages = null,
  maxTokens = 320,
  jsonMode = false,
  logFn = null,
  purpose = 'chat',
  model = DEEPSEEK_FLASH_MODEL,
  tools = [],
  reasoningEffort = 'none',
} = {}) {
  const resolvedModel = model || DEEPSEEK_FLASH_MODEL;
  const effort = normalizeReasoningEffort(reasoningEffort);
  const resolvedMessages = messages || [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userContent },
  ];

  const request = {
    model: resolvedModel,
    messages: resolvedMessages,
    max_tokens: maxTokens,
    stream: false,
  };

  const chatTools = toolsForChatCompletions(tools);
  if (chatTools.length) request.tools = chatTools;

  if (jsonMode) {
    request.response_format = { type: 'json_object' };
  }

  if (resolvedModel === DEEPSEEK_PRO_MODEL) {
    request.reasoning = { effort };
    if (jsonMode && effort === 'none') {
      request.thinking = { type: 'disabled' };
    }
  }

  const completion = await getDeepSeekClient().chat.completions.create(request);
  const usage = completion.usage || {};
  logUsage(logFn, 'deepseek_cache_usage', usage, {
    purpose,
    model: resolvedModel,
    api: 'chat',
    reasoning_effort: effort,
  });

  return {
    content: completion.choices[0]?.message?.content?.trim() || '',
    message: completion.choices[0]?.message || null,
    usage,
    model: resolvedModel,
    completion,
  };
}

async function createResponsesOnce(request) {
  const client = getDeepSeekClient();
  if (typeof client.responses?.create !== 'function') {
    throw new Error('responses_unavailable');
  }
  const attempts = [
    request,
    { ...request, text: { format: { type: 'json_object' } } },
    { ...request, reasoning: undefined, text: { format: { type: 'json_object' } } },
  ];
  let lastErr;
  for (const body of attempts) {
    try {
      return await client.responses.create(body);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function deepseekChatWithTools({
  instructions,
  userContent,
  historyMessages = [],
  tools = [],
  runTool = null,
  maxRounds = 4,
  logFn = null,
  purpose = 'chat',
  model,
  maxOutputTokens = 360,
  reasoningEffort = 'none',
} = {}) {
  const chatTools = toolsForChatCompletions(tools);
  const messages = [
    { role: 'system', content: instructions },
    ...historyMessages,
    { role: 'user', content: userContent },
  ];

  for (let round = 0; round <= maxRounds; round += 1) {
    const waitingOnTools = Boolean(chatTools.length && typeof runTool === 'function' && round < maxRounds);
    const { message, content, completion } = await deepseekChatCompletion({
      messages,
      maxTokens: maxOutputTokens,
      jsonMode: !waitingOnTools,
      tools: waitingOnTools ? chatTools : [],
      logFn,
      purpose,
      model,
      reasoningEffort,
    });
    const calls = toolCallsFromChatMessage(message);
    if (!calls.length || typeof runTool !== 'function' || round >= maxRounds) {
      return { text: content || message?.content || '', api: 'chat', response: completion };
    }

    messages.push({
      role: 'assistant',
      content: message.content || null,
      tool_calls: calls,
    });
    for (const call of calls) {
      const result = await runToolSafe(
        runTool,
        call.function?.name || call.name,
        parseToolArgs(call.function?.arguments || call.arguments),
      );
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
  }

  return { text: '', api: 'chat', response: null };
}

/**
 * Responses API con tools + text.format (json_schema).
 * Si DeepSeek no acepta el endpoint, Chat Completions con tools + json_object.
 */
export async function deepseekRespondWithTools({
  instructions,
  userContent,
  historyMessages = [],
  tools = [],
  jsonSchema = null,
  runTool = null,
  maxRounds = 4,
  logFn = null,
  purpose = 'chat',
  model,
  maxOutputTokens = 360,
  reasoningEffort = 'none',
} = {}) {
  const resolvedModel = model || DEEPSEEK_PRO_MODEL;
  const effort = normalizeReasoningEffort(reasoningEffort);
  let input = [
    ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ];
  const text = buildResponsesTextFormat(jsonSchema);

  try {
    for (let round = 0; round <= maxRounds; round += 1) {
      const request = {
        model: resolvedModel,
        instructions,
        input,
        max_output_tokens: maxOutputTokens,
        stream: false,
        reasoning: { effort },
        text,
      };
      if (tools.length) request.tools = tools;

      const response = await createResponsesOnce(request);
      logUsage(logFn, 'deepseek_cache_usage', usageFromResponsesApi(response.usage || {}), {
        purpose,
        model: resolvedModel,
        api: 'responses',
        round,
        reasoning_effort: effort,
      });

      const calls = functionCallsFromResponse(response);
      const textOut = extractResponsesOutputText(response);
      if (!calls.length || typeof runTool !== 'function' || round >= maxRounds) {
        return { text: textOut, api: 'responses', response };
      }

      const followups = [];
      for (const call of calls) {
        const result = await runToolSafe(runTool, call.name, parseToolArgs(call.arguments));
        followups.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
      input = [...input, ...calls, ...followups];
    }
  } catch (err) {
    if (typeof logFn === 'function') {
      logFn('deepseek_responses_fallback_chat', {
        purpose,
        model: resolvedModel,
        message: err?.message || 'responses_failed',
      });
    }
  }

  return deepseekChatWithTools({
    instructions,
    userContent,
    historyMessages,
    tools,
    runTool,
    maxRounds,
    logFn,
    purpose,
    model: resolvedModel,
    maxOutputTokens,
    reasoningEffort: effort,
  });
}
