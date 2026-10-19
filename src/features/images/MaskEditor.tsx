import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, Image as SkiaImage, ImageFormat, PaintStyle, Path, Skia, StrokeCap, StrokeJoin, BlendMode, AlphaType, ColorType, useImage, type SkImage } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import { Attachment, uid } from '../../core/types';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; width: number; erase: boolean };
type Camera = { scale: number; x: number; y: number };
export type MaskEditorProps = { image: Attachment; onSave: (mask: Attachment) => void; onClose: () => void };
function pathOf(points: Point[]) {
  const builder = Skia.PathBuilder.Make();
  if (points.length) {
    builder.moveTo(points[0].x, points[0].y);
    if (points.length === 1) builder.lineTo(points[0].x + 0.01, points[0].y);
    else points.slice(1).forEach(p => builder.lineTo(p.x, p.y));
  }
  const path = builder.detach();
  builder.dispose();
  return path;
}

export function MaskEditor({ image, onSave, onClose }: MaskEditorProps) {
  const [imageError, setImageError] = useState('');
  const bitmap = useImage(image.uri, error => setImageError(error.message));
  const [bounds, setBounds] = useState({ width: 1, height: 1 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);
  const [brush, setBrush] = useState(32);
  const [mode, setMode] = useState<'brush' | 'erase' | 'move'>('brush');
  const [camera, setCamera] = useState<Camera>({ scale: 1, x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const activeRef = useRef<Stroke | null>(null);
  const gesture = useRef<{ camera: Camera; center: Point; distance: number } | null>(null);
  const width = bitmap?.width() || image.width || 1;
  const height = bitmap?.height() || image.height || 1;
  const fit = Math.min(bounds.width / width, bounds.height / height);
  const scale = fit * camera.scale;
  const offset = { x: (bounds.width - width * fit) / 2 + camera.x, y: (bounds.height - height * fit) / 2 + camera.y };
  function finish() {
    const current = activeRef.current;
    if (current?.points.length) { setStrokes(s => [...s, current]); setRedo([]); }
    activeRef.current = null; setActive(null);
  }
  function touchesOf(event: any) {
    return event.nativeEvent.touches as { locationX: number; locationY: number }[];
  }
  function navigation(event: any) {
    const touches = touchesOf(event);
    if (!touches.length) return;
    const first = touches[0], second = touches[1];
    const center = second ? { x: (first.locationX + second.locationX) / 2, y: (first.locationY + second.locationY) / 2 } : { x: first.locationX, y: first.locationY };
    const distance = second ? Math.hypot(first.locationX - second.locationX, first.locationY - second.locationY) : 0;
    if (!gesture.current || (!!distance !== !!gesture.current.distance)) {
      activeRef.current = null; setActive(null); gesture.current = { camera, center, distance }; return;
    }
    const start = gesture.current;
    const nextScale = Math.max(1, Math.min(8, start.camera.scale * (distance && start.distance ? distance / start.distance : 1)));
    const ratio = nextScale / start.camera.scale;
    const baseX = (bounds.width - width * fit) / 2, baseY = (bounds.height - height * fit) / 2;
    setCamera({ scale: nextScale, x: center.x - baseX - (start.center.x - baseX - start.camera.x) * ratio, y: center.y - baseY - (start.center.y - baseY - start.camera.y) * ratio });
  }
  function draw(event: any, initial: boolean) {
    const touches = touchesOf(event);
    if (mode === 'move' || touches.length > 1 || gesture.current) { navigation(event); return; }
    const touch = touches[0]; if (!touch || !bitmap) return;
    const point = { x: (touch.locationX - offset.x) / scale, y: (touch.locationY - offset.y) / scale };
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) { finish(); return; }
    if (initial || !activeRef.current) activeRef.current = { points: [point], width: brush / scale, erase: mode === 'erase' };
    else activeRef.current = { ...activeRef.current, points: [...activeRef.current.points, point] };
    setActive(activeRef.current);
  }
  const eventsRef = useRef({ draw, finish, saving });
  eventsRef.current = { draw, finish, saving };
  const responder = useRef(PanResponder.create({ onStartShouldSetPanResponder: () => !eventsRef.current.saving, onMoveShouldSetPanResponder: () => !eventsRef.current.saving,
    onPanResponderGrant: e => { gesture.current = null; eventsRef.current.draw(e, true); }, onPanResponderMove: e => eventsRef.current.draw(e, false),
    onPanResponderRelease: () => { eventsRef.current.finish(); gesture.current = null; }, onPanResponderTerminate: () => { eventsRef.current.finish(); gesture.current = null; }, onPanResponderTerminationRequest: () => false })).current;

  async function save() {
    if (!bitmap || savingRef.current) return;
    const all = activeRef.current ? [...strokes, activeRef.current] : strokes;
    if (!all.some(s => !s.erase)) { Alert.alert('尚未选择区域', '请先涂抹需要修改的区域。'); return; }
    savingRef.current = true; setSaving(true);
    let surface: ReturnType<typeof Skia.Surface.MakeOffscreen> = null;
    let snapshot: SkImage | null = null;
    try {
      surface = Skia.Surface.MakeOffscreen(width, height);
      if (!surface) throw new Error('图片尺寸过大，无法创建蒙版画布。');
      const canvas = surface.getCanvas(); canvas.drawColor(Skia.Color('white'));
      for (const stroke of all) {
        const paint = Skia.Paint(); paint.setAntiAlias(true); paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeWidth(stroke.width); paint.setStrokeCap(StrokeCap.Round); paint.setStrokeJoin(StrokeJoin.Round);
        paint.setColor(Skia.Color('white')); paint.setBlendMode(stroke.erase ? BlendMode.SrcOver : BlendMode.Clear);
        const path = pathOf(stroke.points);
        canvas.drawPath(path, paint);
        path.dispose(); paint.dispose();
      }
      surface.flush();
      snapshot = surface.makeImageSnapshot();
      const pixels = snapshot.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
      let transparent = false;
      if (pixels) for (let index = 3; index < pixels.length; index += 4) { if (pixels[index] === 0) { transparent = true; break; } }
      if (!transparent) throw new Error('蒙版没有可编辑区域，请重新涂抹。');
      if (!FileSystem.documentDirectory) throw new Error('无法访问应用附件目录。');
      const id = uid(), directory = `${FileSystem.documentDirectory}attachments/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const uri = `${directory}${id}-mask.png`;
      await FileSystem.writeAsStringAsync(uri, snapshot.encodeToBase64(ImageFormat.PNG), { encoding: FileSystem.EncodingType.Base64 });
      onSave({ id, uri, name: '局部修改蒙版.png', mime: 'image/png', kind: 'image', width, height, parentId: image.id, createdAt: Date.now() });
    } catch (error) { Alert.alert('蒙版保存失败', error instanceof Error ? error.message : String(error)); }
    finally { snapshot?.dispose(); surface?.dispose(); savingRef.current = false; setSaving(false); }
  }
  const all = active ? [...strokes, active] : strokes;
  return <View style={styles.root}>
    <View style={styles.header}><Text style={styles.title}>涂抹需要修改的区域</Text><Pressable onPress={onClose} disabled={saving}><Text style={styles.action}>关闭</Text></Pressable></View>
    <Text style={styles.help}>红色区域将被修改 · 双指缩放移动 · 橡皮恢复保留区域</Text>
    <View style={styles.canvas} onLayout={e => setBounds(e.nativeEvent.layout)} {...responder.panHandlers}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group transform={[{ translateX: offset.x }, { translateY: offset.y }, { scale }]} clip={{ x: 0, y: 0, width, height }}>
          {bitmap && <SkiaImage image={bitmap} x={0} y={0} width={width} height={height} fit="fill" />}
          <Group layer>{all.map((s, index) => <Path key={index} path={pathOf(s.points)} color="rgba(248,64,83,0.5)" style="stroke" strokeWidth={s.width} strokeCap="round" strokeJoin="round" blendMode={s.erase ? 'clear' : 'srcOver'} />)}</Group>
        </Group>
      </Canvas>
      {!bitmap && (imageError ? <Text style={styles.help}>图片加载失败：{imageError}</Text> : <ActivityIndicator style={styles.loader} color="#fff" />)}
    </View>
    <View style={styles.tools}>{(['brush', 'erase', 'move'] as const).map((value, i) => <Pressable key={value} disabled={saving} style={[styles.button, mode === value && styles.selected]} onPress={() => setMode(value)}><Text style={styles.text}>{['画笔', '橡皮', '移动'][i]}</Text></Pressable>)}
      <Pressable disabled={!strokes.length || saving} style={styles.button} onPress={() => { setRedo(r => [...r, strokes[strokes.length - 1]]); setStrokes(s => s.slice(0, -1)); }}><Text style={styles.text}>撤销</Text></Pressable>
      <Pressable disabled={!redo.length || saving} style={styles.button} onPress={() => { setStrokes(s => [...s, redo[redo.length - 1]]); setRedo(r => r.slice(0, -1)); }}><Text style={styles.text}>重做</Text></Pressable>
    </View>
    <View style={styles.tools}>{[16, 32, 64].map(size => <Pressable key={size} disabled={saving} style={[styles.button, brush === size && styles.selected]} onPress={() => setBrush(size)}><Text style={styles.text}>{size}px</Text></Pressable>)}
      <Pressable disabled={saving} style={styles.button} onPress={() => setCamera({ scale: 1, x: 0, y: 0 })}><Text style={styles.text}>适应</Text></Pressable>
      <Pressable disabled={saving} style={styles.button} onPress={() => { setStrokes([]); setRedo([]); }}><Text style={styles.text}>清空</Text></Pressable>
    </View>
    <Pressable disabled={saving || !bitmap} style={styles.save} onPress={save}><Text style={styles.saveText}>{saving ? '正在保存蒙版…' : '使用此区域'}</Text></Pressable>
  </View>;
}
export default MaskEditor;
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#10151c', padding: 16 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: 'white', fontSize: 18, fontWeight: '600' }, action: { color: '#68e1be', padding: 8 }, help: { color: '#a3adba', fontSize: 12, marginVertical: 10 }, canvas: { flex: 1, overflow: 'hidden', backgroundColor: '#202832' }, loader: { flex: 1 }, tools: { flexDirection: 'row', gap: 6, marginTop: 10 }, button: { backgroundColor: '#29333f', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }, selected: { backgroundColor: '#386c61' }, text: { color: 'white', fontSize: 13 }, save: { backgroundColor: '#68e1be', padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 12 }, saveText: { color: '#10241f', fontWeight: '700' } });
