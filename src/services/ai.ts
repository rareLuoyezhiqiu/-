import { isAndroid, AndroidBridge, nativeStream } from './native';
import { upstreamBody, readUpstream } from '../../shared/upstream';
import { events } from '../../shared/sse';
export interface AIConfig { provider: string; model: string; endpoint: string; protocol: string; policyUrl: string; revision: string; configured: boolean }
export const accessToken = { value: '' }; // Memory only, deliberately excluded from all backups.
export async function api(path: string, body?: unknown, signal?: AbortSignal) {
  if (isAndroid) {
    const value = path === '/api/config' ? await AndroidBridge.getConfig() : await AndroidBridge.saveConfig(body as Record<string, unknown>);
    return new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
  }
  const response = await fetch(path, { signal, method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken.value}` }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) { let message = 'AI 服务暂不可用，请检查服务端与 API 设置'; try { message = (await response.json()).message ?? message; } catch {} throw Error(message); }
  return response;
}
export async function expand(content: string, requestId: string, revision: string, signal: AbortSignal, delta: (text: string) => void) {
  if ([...content].length > 4000) throw Error('原文超过 4,000 字，无法拓写，请先缩短原文');
  if (isAndroid) {
    const config = await AndroidBridge.getConfig() as unknown as AIConfig;
    if (!config.configured || config.revision !== revision) throw Error('API 设置已变化，请重新确认后生成');
    return readUpstream(await nativeStream(requestId,revision,upstreamBody(config,content),signal),config.protocol,delta);
  }
  const response = await fetch('/api/expand', { method: 'POST', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken.value}`, 'X-AI-Revision': revision }, body: JSON.stringify({ content, requestId }) });
  if (!response.ok) { let message = 'AI 服务暂不可用，请稍后重试'; try { message = (await response.json()).message ?? message; } catch {} throw Error(message); }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw Error('AI 响应格式异常');
  let text = '', completed = false;
  for await (const item of events(response.body)) {
    const data = JSON.parse(item.data);
    if (data.requestId !== requestId) throw Error('AI 响应标识不一致，请重试');
    if (item.event === 'error') throw Error(data.message || '生成失败，请重试');
    if (item.event === 'delta') {
      if (typeof data.text !== 'string') throw Error('AI 响应格式异常');
      text += data.text;
      if (new TextEncoder().encode(text).length > 16384) throw Error('拓写过长，请重新生成');
      delta(text);
    }
    if (item.event === 'done') { completed = true; break; }
  }
  if (!completed || !text.trim()) throw Error('未收到完整拓写，请手动重试');
  return text;
}
