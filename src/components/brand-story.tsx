import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from './brand-logo';
import { colors as c } from '../theme';

export const brandMotto = '一念初起，万象渐明';

export function BrandStory() {
  return (
    <View style={s.container}>
      <Text accessibilityRole="header" style={s.label}>烛的来处</Text>
      <View style={s.brand}><Text style={s.name}>烛</Text><View style={{ marginBottom: -16 }}><BrandLogo size={56} /></View></View>
      <Text style={s.motto}>{brandMotto}</Text>
      <View style={s.quote}>
        <Text selectable style={s.quotation}>“视为昼，瞑为夜。”</Text>
        <Text style={s.source}>——《山海经·海外北经》</Text>
      </View>
      <Text selectable style={s.body}>烛，取意于中国古代神话中的烛龙。《山海经》称其为“烛阴”，开阖双眼，昼夜随之更替。我们借这一意象，寄托一个愿望：让微小的心念，也有打开新天地的可能。</Text>
      <Text selectable style={s.body}>烛，也是身边的一点光。让疑问在对话中渐渐清晰，让灵感在创作中慢慢成形。从一句话、一份文档，到一幅心中的画面，每一次表达，都可以是探索的开始。</Text>
      <Text style={s.closing}>愿你心中所想，渐有形状。</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: c.paper, borderRadius: 16, padding: 24, gap: 16 },
  label: { color: c.muted, fontSize: 12, letterSpacing: 2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  name: { color: c.accent, fontSize: 44, fontWeight: '600' },
  motto: { color: c.ink, fontSize: 19, lineHeight: 30, fontWeight: '500' },
  quote: { gap: 6, paddingVertical: 8 },
  quotation: { color: c.ink, fontSize: 16, lineHeight: 26 },
  source: { color: c.muted, fontSize: 12, lineHeight: 20 },
  body: { color: c.ink, fontSize: 14, lineHeight: 26 },
  closing: { color: c.accent, fontSize: 14, lineHeight: 24, paddingTop: 4 },
});
