import { ref } from 'vue';
import type { Note, Expansion } from '../db';
import { retainExpansion } from '../db';
import { api, expand, type AIConfig } from '../services/ai';
export function useExpansion(refresh: () => Promise<void>) {
  const target = ref<Note>(), text = ref(''), status = ref('idle'), message = ref(''), saving = ref(false), visible = ref(false), config = ref<AIConfig>();
  let controller: AbortController | undefined, generation = 0, generatedAt = 0;
  const hasCandidate = () => !!text.value && status.value !== 'saved';
  function cancel() { generation++; controller?.abort(); if (status.value === 'generating') { status.value = 'cancelled'; message.value = '已取消，部分内容不可保留'; } }
  function close() {
    if ((hasCandidate() || status.value === 'generating') && !confirm('关闭将放弃未保留的拓写，并取消当前生成。是否继续？')) return;
    cancel(); target.value = undefined; text.value = ''; visible.value = false; status.value = 'idle';
  }
  function open(note: Note, saved?: Expansion) {
    if (target.value?.id === note.id) { visible.value = true; return true; }
    if (status.value === 'generating' || saving.value) { alert('已有拓写任务，请先查看或取消当前任务'); return false; }
    if (hasCandidate() && !confirm('放弃当前未保留的拓写，查看另一条记录？')) return false;
    cancel(); target.value = { ...note, content: saved?.sourceContent ?? note.content }; text.value = saved?.content ?? ''; status.value = saved ? 'saved' : 'idle'; message.value = ''; visible.value = true; return true;
  }
  async function generate(note: Note) {
    if (status.value === 'generating' || saving.value) return;
    if (!navigator.onLine) { message.value = 'AI 拓写需要联网'; return; }
    if (hasCandidate() && !confirm('重新生成将放弃当前未保留结果。是否继续？')) return;
    if ([...note.content].length > 4000) { message.value = '原文超过 4,000 字，请先缩短原文'; return; }
    // Reserve the task before awaiting metadata or confirmation.
    const ticket = ++generation; controller = new AbortController(); const signal = controller.signal;
    status.value = 'generating'; message.value = ''; target.value = { ...note }; text.value = '';
    const taskController = controller;
    const timeout = setTimeout(() => taskController.abort('timeout'), 45000);
    try {
      config.value = await (await api('/api/config', undefined, signal)).json();
      if (ticket !== generation) return;
      const cfg = config.value!;
      if (!cfg.configured) throw Error('AI 尚未配置，请先打开 API 设置');
      let accepted = ''; try { accepted = localStorage.getItem('ai-consent') ?? ''; } catch {}
      if (accepted !== cfg.revision) {
        if (!confirm(`使用 AI 拓写时，会将当前这条灵感正文发送至本应用的 AI 接口及 ${cfg.provider}（${new URL(cfg.endpoint).host}，${cfg.model}）进行处理。其他记录和草稿不会发送。\n数据处理政策：${cfg.policyUrl}\n上游可能保留数据，请阅读政策。是否继续？`)) { status.value = 'idle'; return; }
        try { localStorage.setItem('ai-consent', cfg.revision); } catch {}
      }
      const result = await expand(note.content, crypto.randomUUID(), cfg.revision, signal, value => { if (ticket === generation) text.value = value; });
      if (ticket !== generation) return;
      text.value = result; generatedAt = Date.now(); status.value = 'ready';
    } catch (error) {
      if (ticket !== generation) return;
      status.value = 'error'; message.value = signal.aborted ? '生成超时，请手动重试' : error instanceof Error ? error.message : '网络连接失败，请手动重试';
    } finally { clearTimeout(timeout); }
  }
  async function retain(replacing: boolean) {
    if (status.value !== 'ready' || saving.value || !target.value) return;
    if (replacing && !confirm('用这份新结果替换已保留的拓写？旧版本将无法恢复。')) return;
    saving.value = true; message.value = '';
    try { await retainExpansion(target.value.id, text.value, target.value.content, generatedAt); status.value = 'saved'; await refresh(); }
    catch (error) { message.value = `尚未保留：${error instanceof Error && error.message.includes('原文') ? error.message : '本机写入失败，请重试'}`; }
    finally { saving.value = false; }
  }
  function deleted(id: string) { if (target.value?.id === id) { cancel(); visible.value = false; target.value = undefined; text.value = ''; status.value = 'idle'; } }
  return { target, text, status, message, saving, visible, config, hasCandidate, cancel, close, open, generate, retain, deleted };
}
