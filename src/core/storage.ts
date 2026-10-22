import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Conversation, ProviderSettings, defaultSettings } from './types';

type Snapshot = { settings: ProviderSettings; conversations: Conversation[]; activeId: string | null };
let database: import('expo-sqlite').SQLiteDatabase | undefined;
let queue = Promise.resolve();
const storageKey = 'ants-chat-state-v1';
const credentialKey = 'ants-chat-provider-key';

let webDatabase: Promise<IDBDatabase> | undefined;
function webDb(): Promise<IDBDatabase> {
  if (!webDatabase) {
    webDatabase = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ants-chat', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); webDatabase = undefined; };
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('无法打开浏览器数据库'));
      request.onblocked = () => reject(new Error('数据库升级被其他页面占用，请关闭其他应用页面后重试'));
    }).catch(error => { webDatabase = undefined; throw error; });
  }
  return webDatabase;
}
async function webSnapshot(value?: string, key = storageKey): Promise<string | undefined> {
  const database = await webDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('state', value === undefined ? 'readonly' : 'readwrite');
    const store = transaction.objectStore('state');
    const request = value === undefined ? store.get(key) : store.put(value, key);
    // Success means the transaction committed, not merely that the request ran.
    transaction.oncomplete = () => resolve(value === undefined ? request.result : undefined);
    transaction.onabort = () => reject(transaction.error ?? new Error('浏览器记录保存事务已取消'));
    transaction.onerror = () => reject(transaction.error ?? new Error('浏览器数据库读写失败'));
  });
}

async function db() {
  if (!database) {
    const SQLite = await import('expo-sqlite');
    database = await SQLite.openDatabaseAsync('ants-chat.db');
    await database.execAsync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); PRAGMA user_version=1;');
  }
  return database;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const raw = Platform.OS === 'web' ? (await webSnapshot() ?? localStorage.getItem(storageKey)) : (await (await db()).getFirstAsync<{value:string}>('SELECT value FROM state WHERE id=1'))?.value;
  if (!raw) return { settings: defaultSettings, conversations: [], activeId: null };
  const parsed = JSON.parse(raw) as Snapshot;
  if (!Array.isArray(parsed.conversations)) throw new Error('本地记录格式损坏，请先备份应用数据。');
  // Keep the legacy snapshot as a backup; only migrate validated records.
  if (Platform.OS === 'web') await webSnapshot(raw);
  return { ...parsed, settings: { ...defaultSettings, ...parsed.settings }, conversations: parsed.conversations.map(c => ({ ...c, messages: c.messages.map(m => m.status === 'running' ? { ...m, status: 'interrupted', text: `${m.text}\n\n任务已中断，未自动重试。上游结果及费用可能仍需确认。`, steps: m.steps?.map(s => s.status === 'running' ? {...s, status:'failed', detail:'应用退出，结果待确认'} : s) } : m) })) };
}

export function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const serialized = JSON.stringify(snapshot);
  const pending = queue.catch(() => {}).then(async () => {
    if (Platform.OS === 'web') await webSnapshot(serialized);
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

// Model names only: never persist credentials with the catalog.
export async function loadModelCatalog(url: string): Promise<string[] | undefined> {
  const key = 'models:' + url.trim();
  let raw: string | undefined;
  if (Platform.OS === 'web') raw = await webSnapshot(undefined, key);
  else {
    const database = await db();
    await database.execAsync('CREATE TABLE IF NOT EXISTS model_catalog (url TEXT PRIMARY KEY, value TEXT NOT NULL)');
    raw = (await database.getFirstAsync<{value:string}>('SELECT value FROM model_catalog WHERE url=?', key))?.value;
  }
  if (!raw) return undefined;
  const models: unknown = JSON.parse(raw);
  return Array.isArray(models) && models.every(model => typeof model === 'string') ? models : undefined;
}
export async function saveModelCatalog(url: string, models: string[]): Promise<void> {
  const key = 'models:' + url.trim();
  const raw = JSON.stringify(models);
  if (Platform.OS === 'web') await webSnapshot(raw, key);
  else {
    const database = await db();
    await database.execAsync('CREATE TABLE IF NOT EXISTS model_catalog (url TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await database.runAsync('INSERT INTO model_catalog(url,value) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET value=excluded.value', key, raw);
  }
}
