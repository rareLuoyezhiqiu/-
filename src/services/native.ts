import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
export const isAndroid = Capacitor.getPlatform() === 'android';
interface NativeBridge {
  getConfig(): Promise<Record<string, unknown>>;
  saveConfig(config: Record<string, unknown>): Promise<{message: string}>;
  clearConfig(): Promise<void>;
  start(options: {requestId: string; revision: string; body: string}): Promise<void>;
  cancel(options: {requestId: string}): Promise<void>;
  exportJSON(options: {filename: string; content: string}): Promise<void>;
  addListener(event: 'stream', callback: (event: {requestId: string; text?: string; done?: boolean; error?: string}) => void): Promise<PluginListenerHandle>;
}
export const AndroidBridge = registerPlugin<NativeBridge>('Inspiration');
export async function nativeStream(requestId: string, revision: string, body: unknown, signal: AbortSignal) {
  let handle: PluginListenerHandle | undefined, disposed = false;
  let rejectStream = (_message: string) => {};
  const abort = () => { rejectStream('生成已取消或超时'); void AndroidBridge.cancel({requestId}); };
  const cleanup = () => { disposed = true; signal.removeEventListener('abort', abort); void handle?.remove(); };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reject = (message: string) => { if (!disposed) { controller.error(Error(message)); cleanup(); } };
      rejectStream = reject;
      try {
        handle = await AndroidBridge.addListener('stream', event => {
          if (event.requestId !== requestId || disposed) return;
          if (event.error) reject(event.error);
          else if (event.done) { controller.close(); cleanup(); }
          else if (event.text) controller.enqueue(new TextEncoder().encode(event.text));
        });
        signal.addEventListener('abort', abort, {once:true});
        if (signal.aborted) { reject('生成已取消'); return; }
        await AndroidBridge.start({requestId,revision,body:JSON.stringify(body)});
      } catch { reject('无法连接 AI 接口，请检查 API 设置和网络'); }
    },
    cancel() { abort(); cleanup(); },
  });
}
