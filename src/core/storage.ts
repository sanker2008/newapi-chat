import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Conversation, ProviderSettings, defaultSettings } from './types';

type Snapshot = { settings: ProviderSettings; conversations: Conversation[]; activeId: string | null };
let database: import('expo-sqlite').SQLiteDatabase | undefined;
let queue = Promise.resolve();
const storageKey = 'ants-chat-state-v1';
const credentialKey = 'ants-chat-provider-key';

async function db() {
  if (!database) {
    const SQLite = await import('expo-sqlite');
    database = await SQLite.openDatabaseAsync('ants-chat.db');
    await database.execAsync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); PRAGMA user_version=1;');
  }
  return database;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const raw = Platform.OS === 'web' ? localStorage.getItem(storageKey) : (await (await db()).getFirstAsync<{value:string}>('SELECT value FROM state WHERE id=1'))?.value;
  if (!raw) return { settings: defaultSettings, conversations: [], activeId: null };
  const parsed = JSON.parse(raw) as Snapshot;
  if (!Array.isArray(parsed.conversations)) throw new Error('本地记录格式损坏，请先备份应用数据。');
  return { ...parsed, settings: { ...defaultSettings, ...parsed.settings }, conversations: parsed.conversations.map(c => ({ ...c, messages: c.messages.map(m => m.status === 'running' ? { ...m, status: 'interrupted', text: `${m.text}\n\n任务已中断，未自动重试。上游结果及费用可能仍需确认。`, steps: m.steps?.map(s => s.status === 'running' ? {...s, status:'failed', detail:'应用退出，结果待确认'} : s) } : m) })) };
}

export function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const serialized = JSON.stringify(snapshot);
  const pending = queue.catch(() => {}).then(async () => {
    if (Platform.OS === 'web') localStorage.setItem(storageKey, serialized);
    else await (await db()).runAsync('INSERT INTO state(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', serialized);
  });
  queue = pending;
  return pending;
}

export async function loadKey(baseUrl: string): Promise<string> {
  // Browser previews keep credentials in memory only.
  if (Platform.OS === 'web') return '';
  const raw=await SecureStore.getItemAsync(credentialKey);
  if(!raw) return '';
  try {const saved=JSON.parse(raw);return saved.baseUrl===baseUrl.trim() && typeof saved.key==='string'?saved.key:'';}catch{return '';}
}
export async function saveKey(key: string, baseUrl: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (key) await SecureStore.setItemAsync(credentialKey, JSON.stringify({key,baseUrl:baseUrl.trim()}), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(credentialKey);
}
