import { loadModelCatalog, saveModelCatalog } from '../core/storage';
import type { ProviderSettings } from '../core/types';
import { listModels } from './newapi';

// Credentials remain in memory; model names are persisted separately.
// Keep one credential scope so a changed address/key cannot reuse another list.
const TTL = Infinity;
let entry: { url: string; key: string; models?: string[]; expires: number; pending?: Promise<string[]> } | undefined;

export function getModels(settings: ProviderSettings, key: string, force = false): Promise<string[]> {
  const url = settings.baseUrl.trim();
  if (!url || !key.trim()) return Promise.reject(new Error('请先填写 API 地址和 Key。'));
  if (!entry || entry.url !== url || entry.key !== key) entry = { url, key, expires: 0 };
  const current = entry;
  if (current.pending) return current.pending;
  if (!force && current.models && current.expires > Date.now()) return Promise.resolve([...current.models]);
  current.pending = listModels(settings, key).then(async models => {
    await saveModelCatalog(url, models);
    current.models = [...models]; current.expires = Date.now() + TTL;
    return [...models];
  }).finally(() => { current.pending = undefined; });
  return current.pending;
}

export async function getSavedModels(settings: ProviderSettings, key = ''): Promise<string[]> {
  const saved = await loadModelCatalog(settings.baseUrl);
  if (!saved && key) return getModels(settings, key);
  return saved ?? [...new Set([settings.chatModel, settings.imageModel, settings.searchModel].filter(Boolean))];
}
