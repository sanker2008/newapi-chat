import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Message } from '../core/types';
import { Icon, styles } from './ui';
import { colors as c } from '../theme';

export function ProcessingDetails({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const running = message.status === 'running';
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!running && !message.steps?.length) return null;
  const elapsed = running ? Math.max(0, now - message.createdAt) : message.durationMs;
  const seconds = elapsed === undefined ? undefined : Math.floor(elapsed / 1000);
  const label = seconds === undefined ? '用时未记录' : `用时 ${seconds >= 60 ? `${Math.floor(seconds / 60)}分` : ''}${seconds % 60}秒`;
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '展开'}处理过程，${label}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={[styles.row, { minHeight: 36, gap: 5, alignSelf: 'flex-start' }]}>
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
      <Icon name={expanded ? 'chevron-down' : 'chevron-forward'} size={12} color={c.muted} />
    </Pressable>
    {expanded && message.steps?.map(step => <View key={step.id} style={[styles.row, { paddingVertical: 5, alignItems: 'flex-start' }]}>
      <Icon name={step.status === 'completed' ? 'checkmark-circle-outline' : step.status === 'failed' ? 'alert-circle-outline' : 'ellipse-outline'} size={14} color={step.status === 'failed' ? c.red : c.muted} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>{/^思考与回复 \d+\/\d+$/.test(step.name) ? (step.name.startsWith('思考与回复 1/') ? '处理请求' : '整理回复') : step.name}</Text>
        {!!step.detail && <Text selectable style={{ color: c.muted, fontSize: 11, lineHeight: 17 }}>{step.detail}</Text>}
      </View>
    </View>)}
  </View>;
}
