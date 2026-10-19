import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { Attachment, uid } from '../../core/types';

const MAX_BYTES = 20 * 1024 * 1024;
type PdfResult = { text: string; pages: number; blankPages: number };
type PdfModule = { extractText: (uri: string) => Promise<PdfResult> };

/** Local import only: no document bytes or extracted text leave this device. */
export async function importDocument(): Promise<Attachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/markdown', 'text/x-markdown', 'application/pdf'], multiple: false, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const extension = asset.name.split('.').pop()?.toLowerCase();
  if (!extension || !['txt', 'md', 'pdf'].includes(extension)) throw new Error('仅支持 TXT、MD 和 PDF 文件。');
  if ((asset.size ?? 0) > MAX_BYTES) throw new Error('文档不可超过 20 MB。');
  if (!FileSystem.documentDirectory) throw new Error('文档导入需要 Android 应用本地存储，请在 Android 应用中操作。');
  const directory = `${FileSystem.documentDirectory}attachments/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const id = uid();
  const uri = `${directory}${id}.${extension}`;
  try {
    await FileSystem.copyAsync({ from: asset.uri, to: uri });
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) throw new Error('文档复制失败，请重新选择文件。');
    if (info.size > MAX_BYTES) throw new Error('文档不可超过 20 MB。');
    let text: string;
    if (extension === 'pdf') {
      const module = Platform.OS === 'android' ? requireOptionalNativeModule<PdfModule>('AntsPdf') : null;
      if (!module) throw new Error('PDF 本地提取模块不可用，请使用包含 AntsPdf 的 Android 开发版或安装包；Expo Go 和网页不支持 PDF 提取。');
      const pdf = await module.extractText(uri);
      text = pdf.text;
      if (pdf.blankPages > 0) text = `【提示：${pdf.pages} 页中有 ${pdf.blankPages} 页未提取到文字，可能包含扫描页；以下仅为可提取的文字。】\n\n${text}`;
    } else {
      text = (await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 })).replace(/^\uFEFF/, '');
      if (text.length > 1000000) throw new Error('文档文字过多，请拆分后导入（最多 100 万字符）。');
      if (text.includes('\0')) throw new Error('文档不是有效的 UTF-8 文本，请转存为 UTF-8 TXT 或 MD。');
      const replacementCount = (text.match(/\uFFFD/g) || []).length;
      if (replacementCount > Math.max(3, text.length * 0.005)) throw new Error('文档编码无法识别，请转存为 UTF-8 后导入。');
    }
    if (!text.trim()) throw new Error('文档没有可用文字。');
    return { id, name: asset.name, uri, mime: extension === 'pdf' ? 'application/pdf' : extension === 'md' ? 'text/markdown' : 'text/plain', kind: 'document', text, createdAt: Date.now() };
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}
