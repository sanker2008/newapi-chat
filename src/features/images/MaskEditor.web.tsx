import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Attachment } from '../../core/types';
export type MaskEditorProps = { image: Attachment; onSave: (mask: Attachment) => void; onClose: () => void };
/** The browser preview does not load CanvasKit or claim native mask support. */
export function MaskEditor({ image, onClose }: MaskEditorProps) {
  return <View style={styles.root}>
    <Text style={styles.title}>局部修改</Text>
    <Image source={{ uri: image.uri }} resizeMode="contain" style={styles.image} />
    <Text style={styles.hint}>请在 Android 应用中涂抹修改区域。网页预览不支持原生蒙版编辑。</Text>
    <Pressable onPress={onClose} style={styles.button}><Text style={styles.label}>返回</Text></Pressable>
  </View>;
}
export default MaskEditor;
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#10151c', padding: 20 }, title: { color: '#fff', fontSize: 20 }, image: { flex: 1, minHeight: 200 }, hint: { color: '#b4bfcc', marginVertical: 20 }, button: { padding: 16, backgroundColor: '#68e1be', borderRadius: 14, alignItems: 'center' }, label: { color: '#10241f', fontWeight: '600' } });
