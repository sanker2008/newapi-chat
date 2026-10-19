import type { ProviderSettings } from '../core/types';
import { listModels } from './newapi';

// Session-only cache: credentials never enter SQLite, localStorage or logs.
// Keep one credential scope so a changed address/key cannot reuse another list.
const TTL = 5 * 60 * 1000;
let entry: { url: string; key: string; models?: string[]; expires: number; pending?: Promise<string[]> } | undefined;

export function getModels(settings: ProviderSettings, key: string, force = false): Promise<string[]> {
  const url = settings.baseUrl.trim();
  if (!url || !key.trim()) return Promise.reject(new Error('请先填写 API 地址和 Key。'));
  if (!entry || entry.url !== url || entry.key !== key) entry = { url, key, expires: 0 };
  const current = entry;
  if (current.pending) return current.pending;
  if (!force && current.models && current.expires > Date.now()) return Promise.resolve([...current.models]);
  current.pending = listModels(settings, key).then(models => {
    current.models = [...models]; current.expires = Date.now() + TTL;
    return [...models];
  }).finally(() => { current.pending = undefined; });
  return current.pending;
}
