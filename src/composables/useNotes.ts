import { ref, onScopeDispose } from 'vue';
import * as repository from '../db';
import type { Note, Draft, Expansion } from '../db';
export function useNotes() {
  const notes = ref<Note[]>([]), draft = ref<Draft>();
  const expansions = ref<Expansion[]>([]), kind = ref<Draft['kind']>('note');
  const loading = ref(true), loadError = ref(''), error = ref(''), busy = ref(false);
  const content = ref(''), noteId = ref<string>(), draftStatus = ref('');
  let subscription: { unsubscribe: () => void } | undefined;
  onScopeDispose(() => subscription?.unsubscribe());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  async function load() {
    loading.value = true; loadError.value = '';
    try { await repository.openDatabase(); [notes.value, draft.value, expansions.value] = await Promise.all([repository.listNotes(), repository.getDraft(), repository.listExpansions()]);
      subscription ??= repository.watchRecords(([latestNotes, latestExpansions]) => { notes.value = latestNotes; expansions.value = latestExpansions; }, () => { loadError.value = '无法读取本机数据，请重试'; });
    }
    catch { loadError.value = '无法读取本机数据，请检查浏览器存储权限后重试。'; }
    finally { loading.value = false; }
  }
  function flush() {
    clearTimeout(timer);
    const snapshot: Draft = { id: 'active', kind: kind.value, content: content.value, noteId: noteId.value, updatedAt: Date.now() };
    draft.value = snapshot;
    writes = writes.catch(() => {}).then(() => repository.putDraft(snapshot));
    return writes.then(() => { draftStatus.value = '草稿已暂存'; return true; }, () => { draftStatus.value = '草稿未保存，请勿关闭页面'; return false; });
  }
  function changed() { draftStatus.value = '正在暂存…'; clearTimeout(timer); timer = setTimeout(flush, 180); }
  async function discard() {
    clearTimeout(timer); await writes.catch(() => {});
    try { if (draft.value) await repository.discardDraft(draft.value); draft.value = undefined; error.value = ''; return true; }
    catch { error.value = '无法清除草稿，请重试。'; return false; }
  }
  async function save() {
    if (busy.value || !content.value.trim()) return false;
    busy.value = true; error.value = ''; clearTimeout(timer);
    await writes.catch(() => {});
    try {
      if (kind.value === 'expansion') {
        await repository.editExpansion(noteId.value!, content.value);
        expansions.value = await repository.listExpansions(); draft.value = undefined; return true;
      }
      const note = await repository.saveNote(content.value, noteId.value);
      notes.value = [...notes.value.filter(n => n.id !== note.id), note].sort((a,b) => b.createdAt-a.createdAt || b.id.localeCompare(a.id));
      draft.value = undefined; return true;
    } catch (cause) { error.value = cause instanceof Error && cause.message.includes('删除') ? cause.message : '保存失败，输入已保留。请检查存储空间或权限后重试。'; return false; }
    finally { busy.value = false; }
  }
  async function remove(id: string) {
    busy.value = true; error.value = '';
    try { await repository.deleteNote(id); expansions.value = expansions.value.filter(e => e.noteId !== id); notes.value = notes.value.filter(n => n.id !== id); if (draft.value?.noteId === id) draft.value = undefined; return true; }
    catch { error.value = '删除失败，原记录已保留，请重试。'; return false; }
    finally { busy.value = false; }
  }
  async function exportNotes() {
    try {
      const data = await repository.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `灵感清单-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { error.value = '导出失败，请重试。'; }
  }
  return { expansions, kind, notes, draft, loading, loadError, error, busy, content, noteId, draftStatus, load, flush, changed, discard, save, remove, exportNotes };
}
