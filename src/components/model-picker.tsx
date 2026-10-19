import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../core/store';
import { getModels } from '../services/model-cache';
import { Button, Dialog, Field, Icon, Notice, styles } from './ui';
import { colors as c } from '../theme';

export function ModelPicker({ visible, target, onClose }: {
  visible: boolean; target: 'chatModel' | 'imageModel'; onClose: () => void;
}) {
  const app = useApp();
  const [models, setModels] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!visible) { setRefresh(0); return; }
    let active = true;
    setModels([]); setFilter(''); setError(''); setLoading(false);
    if (app.settings.baseUrl && app.apiKey) {
      setLoading(true);
      getModels(app.settings, app.apiKey, refresh > 0).then(result => { if (active) setModels(result); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [visible, app.settings.baseUrl, app.apiKey, refresh]);
  async function select(model: string) {
    if (saving || app.running) return;
    setSaving(true); setError('');
    try { await app.saveSettings({ ...app.settings, [target]: model }, app.apiKey); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }
  return <Dialog title={target === 'imageModel' ? '选择图片模型' : '选择对话模型'} visible={visible} onClose={onClose}>
    {!app.settings.baseUrl || !app.apiKey ? <><Notice>{app.settings.baseUrl ? '服务地址已配置，请补充 API Key 后获取模型。网页预览刷新后需重新输入 Key。' : '请先配置 API 地址和 Key。'}</Notice><Button title="前往连接设置" onPress={() => { onClose(); router.navigate('/settings'); }} /></> : <>
      <Field label="搜索模型" value={filter} onChangeText={setFilter} placeholder="输入模型名称" />
      {loading && <ActivityIndicator color={c.accent} />}
      {models.filter(m => m.toLowerCase().includes(filter.toLowerCase())).map(model => <Pressable key={model} accessibilityRole="button" accessibilityLabel={`使用模型 ${model}`} accessibilityState={{ selected: app.settings[target] === model }} disabled={saving || !!app.running} onPress={() => void select(model)} style={[styles.row, { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: app.settings[target] === model ? c.accentSoft : c.paper }]}><Text style={{ flex: 1, color: c.ink }}>{model}</Text>{app.settings[target] === model && <Icon name="checkmark" color={c.accent} size={18} />}</Pressable>)}
      {!loading && !error && !models.some(m => m.toLowerCase().includes(filter.toLowerCase())) && <Text style={{ color: c.muted }}>没有可选模型，可刷新列表或在设置中填写模型名称。</Text>}
      <View style={styles.row}><Button secondary title="刷新列表" disabled={loading || saving} onPress={() => setRefresh(v => v + 1)} /><Button secondary title="模型设置" onPress={() => { onClose(); router.navigate('/settings'); }} /></View>
    </>}
    {!!error && <Notice error>{error}</Notice>}
    {saving && <ActivityIndicator color={c.accent} />}
  </Dialog>;
}
