import { fetch } from 'expo/fetch';
import type { ProviderSettings } from '../core/types';
import { apiUrl, ChatAccumulator, EventStream, type ChatResult } from './protocol';

export function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('已停止；已发出的请求仍可能在上游执行或计费');
    error.name = 'AbortError';
    throw error;
  }
}

export function safeMessage(error: unknown, apiKey = ''): string {
  let message = error instanceof Error ? error.message : '请求失败';
  if (apiKey.trim()) message = message.split(apiKey.trim()).join('[已隐藏]');
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]').replace(/sk-[\w-]+/g, '[已隐藏]').slice(0, 700);
}

class HttpFailure extends Error {}

export async function withDeadline<T>(signal: AbortSignal | undefined, milliseconds: number, paid: boolean, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  assertActive(signal);
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, milliseconds);
  try {
    const result = await work(controller.signal);
    assertActive(signal);
    if (timedOut) throw new Error('timeout');
    return result;
  } catch (error) {
    assertActive(signal);
    if (timedOut) throw new Error(paid ? '请求超时，执行结果未知；未自动重发，上游可能已计费，请手动检查后重试' : '请求超时，请手动重试');
    if (error instanceof HttpFailure) throw error;
    if (paid && !(error instanceof Error && /模型|工具|流式|JSON|网关/.test(error.message))) {
      throw new Error('网络连接中断，执行结果未知；未自动重发，上游可能已计费，请手动检查后重试');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function checked(response: Response, key: string): Promise<Response> {
  if (!response.ok) {
    // Keep authentication/header material out of logs and user-visible exceptions.
    let detail = '';
    try {
      const body = JSON.parse(await boundedText(response, 32_000));
      detail = typeof body.error?.message === 'string' ? body.error.message : '';
    } catch { /* Some gateways return HTML error pages. */ }
    throw new HttpFailure(`New API 请求失败（HTTP ${response.status}）${detail ? `：${safeMessage(new Error(detail), key)}` : ''}；未自动重试`);
  }
  return response;
}

export async function boundedText(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('响应内容过大');
  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) throw new Error('响应内容过大');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('响应内容过大');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function requestJson(settings: ProviderSettings, apiKey: string, path: string, options: { body?: unknown; form?: FormData; signal?: AbortSignal; timeout?: number; method?: string; maxBytes?: number } = {}): Promise<any> {
  if (!apiKey.trim()) throw new Error('请先填写 API Key');
  const method = options.method ?? 'POST';
  return withDeadline(options.signal, options.timeout ?? 120_000, method !== 'GET', async signal => {
    const response = await checked(await fetch(apiUrl(settings.baseUrl, path), {
      method, signal, redirect: 'error', credentials: 'omit',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, ...(options.form ? {} : { 'Content-Type': 'application/json' }) },
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    }), apiKey);
    try { return JSON.parse(await boundedText(response, options.maxBytes ?? 2_000_000)); }
    catch { throw new Error('网关返回非 JSON 或过大的响应；未自动重发，已发出的请求可能计费'); }
  });
}

export async function listModels(settings: ProviderSettings, apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const result = await requestJson(settings, apiKey, 'models', { method: 'GET', signal, timeout: 30_000 });
  if (!Array.isArray(result.data)) throw new Error('模型列表格式不兼容');
  return [...new Set<string>(result.data.filter((model: any) => typeof model.id === 'string').map((model: any) => model.id))].sort();
}

export async function streamChat(settings: ProviderSettings, apiKey: string, body: Record<string, unknown>, signal: AbortSignal, onText: (text: string) => void): Promise<ChatResult> {
  return withDeadline(signal, 120_000, true, async requestSignal => {
    const response = await checked(await fetch(apiUrl(settings.baseUrl, 'chat/completions'), {
      method: 'POST', signal: requestSignal, redirect: 'error', credentials: 'omit',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...body, stream: true }),
    }), apiKey);
    const state = new ChatAccumulator();
    // Some compatible gateways ignore stream=true and return a complete JSON response.
    if (response.headers.get('content-type')?.includes('application/json')) {
      state.accept(JSON.parse(await boundedText(response, 2_000_000)));
      const result = state.result(); onText(result.text); return result;
    }
    if (!response.body) throw new Error('网关未提供可读取的流式响应');
    let done = false;
    const events = new EventStream(data => {
      if (data === '[DONE]') { done = true; return; }
      if (done) return;
      let value: any;
      try { value = JSON.parse(data); } catch { throw new Error('流式响应包含无效 JSON；未执行未完成的工具'); }
      const previousLength = state.text.length;
      state.accept(value);
      assertActive(requestSignal);
      if (state.text.length > previousLength) onText(state.text.slice(previousLength));
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (!done) {
        assertActive(requestSignal);
        const chunk = await reader.read();
        if (chunk.done) break;
        events.push(decoder.decode(chunk.value, { stream: true }));
      }
      events.push(decoder.decode());
      if (!done) events.finish();
      assertActive(requestSignal);
      return state.result();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  });
}
