export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ChatResult = { text: string; calls: ToolCall[]; usage?: { input: number; output: number } };

export function apiUrl(base: string, path: string): string {
  let url: URL;
  try { url = new URL(base.trim()); } catch { throw new Error('请填写有效的 New API 地址'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('New API 地址须为 HTTP(S)，不能含账号、查询参数或锚点');
  }
  const root = url.toString().replace(/\/+$/, '');
  return `${root.endsWith('/v1') ? root : `${root}/v1`}/${path.replace(/^\/+/, '')}`;
}

/** Incremental SSE framing: a network chunk is not an event or a JSON object. */
export class EventStream {
  private pending = '';
  private data: string[] = [];
  private emit: (data: string) => void;
  constructor(emit: (data: string) => void) { this.emit = emit; }
  push(chunk: string) {
    this.pending += chunk;
    if (this.pending.length > 2_000_000) throw new Error('流式事件过大，已停止');
    let index: number;
    while ((index = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, index).replace(/\r$/, '');
      this.pending = this.pending.slice(index + 1);
      if (!line) {
        if (this.data.length) this.emit(this.data.join('\n'));
        this.data = [];
      } else if (line.startsWith('data:')) {
        this.data.push(line.slice(5).replace(/^ /, ''));
        if (this.data.join('').length > 2_000_000) throw new Error('流式事件过大，已停止');
      }
    }
  }
  finish() { if (this.pending.trim() || this.data.length) throw new Error('流式响应中断，未执行未完成的工具'); }
}

export class ChatAccumulator {
  text = '';
  private calls = new Map<number, ToolCall>();
  private finishReason: string | null = null;
  private usage?: { input: number; output: number };
  accept(value: any) {
    if (value.error) throw new Error('网关返回流式错误，任务已停止');
    if (value.usage) this.usage = { input: value.usage.prompt_tokens ?? 0, output: value.usage.completion_tokens ?? 0 };
    const choice = value.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
    const delta = choice.delta ?? choice.message ?? {};
    if (typeof delta.content === 'string') this.text += delta.content;
    if (this.text.length > 2_000_000) throw new Error('模型输出过长，已停止');
    for (const [position, part] of (delta.tool_calls ?? []).entries()) {
      const index = part.index ?? position;
      if (!Number.isInteger(index) || index < 0 || index > 15) throw new Error('模型工具调用数量或索引无效');
      const call = this.calls.get(index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
      if (typeof part.id === 'string') call.id += part.id;
      if (typeof part.function?.name === 'string') call.function.name += part.function.name;
      if (typeof part.function?.arguments === 'string') call.function.arguments += part.function.arguments;
      if (call.function.arguments.length > 100_000) throw new Error('工具参数过长');
      this.calls.set(index, call);
    }
  }
  result(): ChatResult {
    if (!this.finishReason) throw new Error('模型响应中断，结果未知；未执行未完成的工具，请手动重试');
    if (!['stop', 'tool_calls', 'function_call'].includes(this.finishReason)) throw new Error(`模型输出被截断或拒绝（${this.finishReason}），工具未执行`);
    const calls = [...this.calls.values()];
    if (calls.some(c => !c.id || !c.function.name) || new Set(calls.map(c => c.id)).size !== calls.length) throw new Error('模型返回的工具调用标识不完整或重复');
    for (const call of calls) parseToolArguments(call.function.arguments);
    return { text: this.text, calls, usage: this.usage };
  }
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('工具参数不是完整 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工具参数必须是对象');
  return value as Record<string, unknown>;
}

export function publicWebUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('网页地址无效'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // IPv6, single-label, local suffixes and all non-public IPv4 ranges are excluded.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  const forbiddenIp = ipv4 && (() => {
    const [a, b] = ipv4.slice(1).map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0) || a >= 224;
  })();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || host.includes(':') || !host.includes('.') || /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host) || forbiddenIp) {
    throw new Error('只允许标准端口的公开 HTTP(S) 网页，不能读取内网、本机或带账号的地址');
  }
  url.hash = '';
  return url.toString();
}

function decodeEntities(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? raw;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

export function extractPage(html: string, url: string) {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, '') ?? '网页');
  const cleaned = html.replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const main = /<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i.exec(cleaned)?.[1] ?? cleaned;
  const text = decodeEntities(main.replace(/<(?:br|\/p|\/div|\/h[1-6]|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  return { title: title.slice(0, 300), url, text: text.slice(0, 20_000), truncated: text.length > 20_000 };
}
