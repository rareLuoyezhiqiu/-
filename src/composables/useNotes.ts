import { ref } from 'vue';
import * as repository from '../db';
import type { Note, Draft } from '../db';
export function useNotes() {
  const notes = ref<Note[]>([]), draft = ref<Draft>();
  const loading = ref(true), loadError = ref(''), error = ref(''), busy = ref(false);
  const content = ref(''), noteId = ref<string>(), draftStatus = ref('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  async function load() {
    loading.value = true; loadError.value = '';
    try { await repository.openDatabase(); [notes.value, draft.value] = await Promise.all([repository.listNotes(), repository.getDraft()]); }
    catch { loadError.value = '无法读取本机数据，请检查浏览器存储权限后重试。'; }
    finally { loading.value = false; }
  }
  function flush() {
    clearTimeout(timer);
    const snapshot: Draft = { id: 'active', content: content.value, noteId: noteId.value, updatedAt: Date.now() };
    draft.value = snapshot;
    writes = writes.catch(() => {}).then(() => repository.putDraft(snapshot));
    return writes.then(() => { draftStatus.value = '草稿已暂存'; return true; }, () => { draftStatus.value = '草稿未保存，请勿关闭页面'; return false; });
  }
  function changed() { draftStatus.value = '正在暂存…'; clearTimeout(timer); timer = setTimeout(flush, 180); }
  async function discard() {
    clearTimeout(timer); await writes.catch(() => {});
    try { await repository.clearDraft(); draft.value = undefined; error.value = ''; return true; }
    catch { error.value = '无法清除草稿，请重试。'; return false; }
  }
  async function save() {
    if (busy.value || !content.value.trim()) return false;
    busy.value = true; error.value = ''; clearTimeout(timer);
    await writes.catch(() => {});
    try {
      const note = await repository.saveNote(content.value, noteId.value);
      notes.value = [...notes.value.filter(n => n.id !== note.id), note].sort((a,b) => b.createdAt-a.createdAt || b.id.localeCompare(a.id));
      draft.value = undefined; return true;
    } catch { error.value = '保存失败，输入已保留。请检查存储空间或权限后重试。'; return false; }
    finally { busy.value = false; }
  }
  async function remove(id: string) {
    busy.value = true; error.value = '';
    try { await repository.deleteNote(id); notes.value = notes.value.filter(n => n.id !== id); if (draft.value?.noteId === id) draft.value = undefined; return true; }
    catch { error.value = '删除失败，原记录已保留，请重试。'; return false; }
    finally { busy.value = false; }
  }
  async function exportNotes() {
    try {
      const data = { formatVersion: 1, exportedAt: new Date().toISOString(), notes: await repository.listNotes() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `灵感清单-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { error.value = '导出失败，请重试。'; }
  }
  return { notes, draft, loading, loadError, error, busy, content, noteId, draftStatus, load, flush, changed, discard, save, remove, exportNotes };
}
