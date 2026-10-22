export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type Attachment = { id: string; name: string; uri: string; mime: string; kind: 'image' | 'document'; width?: number; height?: number; text?: string; parentId?: string; prompt?: string; model?: string; createdAt: number };
export type Step = { id: string; name: string; status: 'running' | 'completed' | 'failed'; detail?: string };
export type Message = { id: string; role: 'user' | 'assistant'; text: string; attachments: Attachment[]; steps?: Step[]; mode?: 'agent' | 'chat' | 'image'; requestMask?: Attachment; durationMs?: number; status?: RunStatus; createdAt: number; usage?: { input: number; output: number } };
export type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };
export type ProviderSettings = { baseUrl: string; chatModel: string; imageModel: string; searchModel: string; searchEnabled: boolean; visionEnabled: boolean; imageEditingEnabled: boolean; maskEnabled: boolean };
export const defaultSettings: ProviderSettings = { baseUrl: '', chatModel: '', imageModel: '', searchModel: '', searchEnabled: false, visionEnabled: false, imageEditingEnabled: false, maskEnabled: false };
export type RunInput = { settings: ProviderSettings; apiKey: string; messages: Message[]; attachments: Attachment[]; mask?: Attachment; mode: 'agent' | 'chat' | 'image'; signal: AbortSignal; onText: (text: string) => void; onStep: (step: Step) => void; onImage: (image: Attachment) => void; onUsage?: (usage: { input: number; output: number }) => void };
export function uid(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
