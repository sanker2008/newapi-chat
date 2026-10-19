import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useApp } from '../core/store';
import { Button, Field, Icon, IconButton } from './ui';
import { colors as c } from '../theme';

export function ConversationDrawer({ visible, onClose, onNew, onSelect, onRename, onDelete }: {
  visible: boolean; onClose: () => void; onNew: () => void; onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void; onDelete: (id: string) => void;
}) {
  const app = useApp();
  const [search, setSearch] = useState('');
  const [managing, setManaging] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  useEffect(() => { if (!visible) setManaging(null); }, [visible]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const conversations = [...app.conversations].sort((a, b) => b.updatedAt - a.updatedAt)
    .filter(v => `${v.title} ${v.messages.map(m => m.text).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const groups = [
    { title: '今天', items: conversations.filter(v => v.updatedAt >= +today) },
    { title: '昨天', items: conversations.filter(v => v.updatedAt >= +yesterday && v.updatedAt < +today) },
    { title: '更早', items: conversations.filter(v => v.updatedAt < +yesterday) },
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭侧边栏遮罩" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={[s.panel, { width: Math.min(340, width * .82) }]}>
        <View style={s.heading}><Text style={s.brand}>PTAH<Text style={{ color: c.accent }}> ·</Text></Text><IconButton name="close" label="关闭侧边栏" onPress={onClose} /></View>
        <View style={s.controls}><Button title="＋ 新建对话" secondary disabled={!!app.running} onPress={() => { setSearch(''); onNew(); }} /><Field label="搜索会话" value={search} onChangeText={setSearch} placeholder="搜索标题或内容" /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 8 }}>
          {groups.filter(g => g.items.length).map(group => <View key={group.title} style={{ gap: 4 }}>
            <Text style={s.group}>{group.title}</Text>
            {group.items.map(v => <View key={v.id} style={[s.row, app.activeId === v.id && { backgroundColor: c.accentSoft }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`打开会话：${v.title}`} accessibilityState={{ selected: app.activeId === v.id }} disabled={!!app.running} onPress={() => onSelect(v.id)} style={s.conversation}>
                <Icon name="chatbubble-outline" size={17} color={app.activeId === v.id ? c.accent : c.muted} /><Text numberOfLines={2} style={s.title}>{v.title}</Text>
              </Pressable>
              <IconButton name="ellipsis-horizontal" label={`管理会话：${v.title}`} onPress={() => setManaging(managing === v.id ? null : v.id)} />
              {managing === v.id && <View style={s.actions}><Button title="重命名" secondary onPress={() => onRename(v.id, v.title)} /><Button title="删除" secondary disabled={!!app.running} onPress={() => onDelete(v.id)} /></View>}
            </View>)}
          </View>)}
          {!conversations.length && <Text style={s.empty}>{search ? '没有匹配的会话' : '还没有对话，从一个想法开始。'}</Text>}
        </ScrollView>
        <View style={s.footer}>{([{ path: '/artworks', title: '作品', icon: 'images-outline' }, { path: '/settings', title: '设置', icon: 'options-outline' }] as const).map(item => <Pressable key={item.path} accessibilityRole="button" onPress={() => { onClose(); router.navigate(item.path); }} style={s.destination}><Icon name={item.icon} size={21} /><Text style={{ color: c.ink, fontSize: 15 }}>{item.title}</Text></Pressable>)}</View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: c.scrim }, panel: { flex: 1, backgroundColor: c.paper },
  heading: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }, brand: { color: c.ink, fontSize: 22, fontWeight: '700' },
  controls: { padding: 16, gap: 20 }, group: { color: c.muted, fontSize: 12, padding: 10, paddingTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', borderRadius: 12 }, conversation: { flex: 1, minHeight: 48, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { flex: 1, color: c.ink, fontSize: 14, lineHeight: 20 },
  actions: { width: '100%', padding: 8, gap: 8 }, empty: { color: c.muted, padding: 16, lineHeight: 24 },
  footer: { padding: 16, gap: 4 }, destination: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingHorizontal: 12 },
});
