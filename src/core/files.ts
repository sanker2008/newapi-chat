import { Image, Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Manipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Attachment, uid } from './types';

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export async function attachmentDirectory() {
  const directory = `${FS.documentDirectory}attachments/`;
  if (Platform.OS !== 'web') await FS.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}
function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
}
async function sizeOf(uri: string) {
  return new Promise<{width:number;height:number}>((resolve, reject) => Image.getSize(uri, (width,height) => resolve({width,height}), reject));
}
export async function attachmentDataUrl(a: Attachment): Promise<string> {
  if (a.uri.startsWith('data:')) return a.uri;
  if (Platform.OS === 'web') return asDataUrl(await (await fetch(a.uri)).blob());
  return `data:${a.mime};base64,${await FS.readAsStringAsync(a.uri,{encoding:FS.EncodingType.Base64})}`;
}
export async function persistRemoteImage(input: { base64?: string; url?: string; name?: string; signal?: AbortSignal }): Promise<Attachment> {
  const id=uid(); let uri=''; let mime='image/png';
  if (input.signal?.aborted) throw new Error('操作已停止');
  const folder=await attachmentDirectory(); const destination=`${folder}${id}.png`;
  try {
    if(input.base64) {
      const raw=input.base64.replace(/^data:[^;]+;base64,/, '');
      if(raw.length > MAX_IMAGE_BYTES*1.4) throw new Error('图片超过 40 MB，请降低尺寸后重试');
      const header=raw.slice(0,16);
      mime=header.startsWith('/9j/')?'image/jpeg':header.startsWith('UklGR')?'image/webp':'image/png';
      if(Platform.OS==='web') uri=`data:${mime};base64,${raw}`;
      else { await FS.writeAsStringAsync(destination,raw,{encoding:FS.EncodingType.Base64}); uri=destination; }
    } else if(input.url) {
      const parsed=new URL(input.url);
      if(!['https:','http:'].includes(parsed.protocol)) throw new Error('服务返回了不安全的图片地址');
      if(Platform.OS==='web') {
        const response=await fetch(input.url,{signal:input.signal}); if(!response.ok) throw new Error('生成成功，但图片下载失败，请检查网络');
        const blob=await response.blob(); if(blob.size>MAX_IMAGE_BYTES) throw new Error('图片超过 40 MB'); mime=blob.type||mime; uri=await asDataUrl(blob);
      } else {
        // Never attach the API token to an upstream media URL.
        const download=FS.createDownloadResumable(input.url,destination,{}, progress => { if(progress.totalBytesWritten>MAX_IMAGE_BYTES) void download.cancelAsync(); });
        const cancel=()=>{void download.cancelAsync();}; input.signal?.addEventListener('abort',cancel);
        try { const result=await download.downloadAsync(); if(!result || result.status!==200) throw new Error('生成成功，但图片下载失败；不会自动重新生成'); uri=result.uri; mime=result.mimeType||mime; }
        finally {input.signal?.removeEventListener('abort',cancel);}
      }
    } else throw new Error('模型没有返回图片');
    if(input.signal?.aborted) throw new Error('操作已停止，上游结果待确认');
    const dimensions=await sizeOf(uri);
    // Use an extension matching the actual image encoding for gallery/export.
    if(Platform.OS!=='web' && mime!=='image/png') { const proper=`${folder}${id}.${mime==='image/jpeg'?'jpg':'webp'}`; await FS.moveAsync({from:uri,to:proper}); uri=proper; }
    if(input.signal?.aborted) throw new Error('操作已停止，上游结果待确认');
    return {id,name:input.name||`Ants-${id}`,uri,mime,kind:'image',...dimensions,createdAt:Date.now()};
  } catch(error) { if(Platform.OS!=='web') {await FS.deleteAsync(destination,{idempotent:true}).catch(()=>{});if(uri && uri.startsWith(folder))await FS.deleteAsync(uri,{idempotent:true}).catch(()=>{});} throw error; }
}
export async function pickImage(camera=false): Promise<Attachment|null> {
  if(camera) {const access=await ImagePicker.requestCameraPermissionsAsync(); if(!access.granted) throw new Error('需要相机权限才能拍照');}
  const result = camera ? await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:1}) : await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1});
  if(result.canceled) return null;
  const source=result.assets[0]; if(source.fileSize && source.fileSize>MAX_IMAGE_BYTES) throw new Error('请选择小于 40 MB 的图片');
  const id=uid();
  const normalized=await Manipulator.manipulateAsync(source.uri,[],{format:Manipulator.SaveFormat.PNG,compress:1});
  let uri=normalized.uri;
  if(Platform.OS==='web') uri=await asDataUrl(await (await fetch(uri)).blob());
  else {uri=`${await attachmentDirectory()}${id}.png`;await FS.copyAsync({from:normalized.uri,to:uri});}
  return {id,name:source.fileName?source.fileName.replace(/\.[^.]+$/, '')+'.png':'参考图片.png',uri,mime:'image/png',kind:'image',width:normalized.width,height:normalized.height,createdAt:Date.now()};
}
export async function saveToGallery(a:Attachment):Promise<void> {
  if(Platform.OS==='web') {const link=document.createElement('a');link.href=a.uri;link.download=`${a.name}.png`;link.click();return;}
  const permission=await MediaLibrary.requestPermissionsAsync(true,['photo']);
  if(!permission.granted) throw new Error('未获得保存图片权限，请在系统设置中允许');
  await MediaLibrary.saveToLibraryAsync(a.uri);
}
export async function shareAttachment(a:Attachment):Promise<void> {
  if(Platform.OS==='web') {await saveToGallery(a);return;}
  if(!await Sharing.isAvailableAsync()) throw new Error('此设备暂不支持分享');
  await Sharing.shareAsync(a.uri,{mimeType:a.mime});
}
export async function clearAttachmentFiles(uris: string[]):Promise<void> {
  if(Platform.OS==='web') return;
  const root=`${FS.documentDirectory}attachments/`;
  for(const uri of new Set(uris)) if(uri.startsWith(root)&&!uri.slice(root.length).includes('/')) await FS.deleteAsync(uri,{idempotent:true});
}
