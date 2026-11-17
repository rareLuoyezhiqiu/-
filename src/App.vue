<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import { useNotes } from './composables/useNotes';
import { offlineReady, needRefresh, pwaError, updateApp } from './pwa';
import type { Note } from './db';
import { listExpansions, deleteExpansion } from './db';
import { useExpansion } from './composables/useExpansion';
import { isAndroid } from './services/native';
import ApiSettings from './components/ApiSettings.vue';
const { expansions, kind, notes, draft, loading, loadError, error, busy, content, noteId, draftStatus, load, flush, changed, discard, save, remove, exportNotes } = useNotes();
const editor = ref<HTMLDialogElement>(), deletion = ref<HTMLDialogElement>(), input = ref<HTMLTextAreaElement>();
const selected = ref<Note>(), toast = ref(''), isEditing = ref(false), storageMessage = ref('');
const ai = useExpansion(async () => { expansions.value = await listExpansions(); });
const aiPanel = ref<HTMLDialogElement>();
const currentNote = computed(() => notes.value.find(n => n.id === ai.target.value?.id));
const stale = computed(() => !!ai.target.value && currentNote.value?.content !== ai.target.value.content);
const orphanDraft = computed(() => !!noteId.value && (!notes.value.some(n => n.id === noteId.value) || (kind.value === 'expansion' && !expansions.value.some(e => e.noteId === noteId.value))));
async function copyDraft() { try { await navigator.clipboard.writeText(content.value); notify('内容已复制'); } catch { input.value?.select(); error.value = '请长按选中的文字复制'; } }
const expansionFor = (id: string) => expansions.value.find(e => e.noteId === id);
watch(ai.visible, async value => { await nextTick(); if (value) aiPanel.value?.showModal(); else aiPanel.value?.close(); });
const editingNote = computed(() => notes.value.find(n => n.id === noteId.value));
const openingAI = ref(false);
const needsSave = computed(() => !editingNote.value || editingNote.value.content !== content.value);
const expandLabel = computed(() => needsSave.value ? '保存并展开' : ai.target.value?.id === noteId.value && ai.status.value === 'generating' ? '正在拓写' : ai.target.value?.id === noteId.value && ai.hasCandidate() ? '查看生成结果' : noteId.value && expansionFor(noteId.value) ? '查看拓写' : '帮我展开');
async function expandFromEditor() {
  if (openingAI.value || busy.value || kind.value !== 'note' || orphanDraft.value || !content.value.trim()) return;
  if (ai.status.value === 'generating' && ai.target.value?.id !== noteId.value) { alert('已有拓写任务，请先查看或取消当前任务'); return; }
  openingAI.value = true;
  try {
    const changed = needsSave.value;
    if (changed ? !await save() : !await discard()) return;
    const note = editingNote.value;
    if (!note) return;
    close(); void openAI(note, changed);
  } finally { openingAI.value = false; }
}
async function returnToEditor() {
  const note = currentNote.value;
  if (!note || ai.saving.value) return;
  ai.visible.value = false; await open(note);
}
async function openAI(note: Note, regenerate = false) { if (ai.open(note, expansionFor(note.id)) && (ai.status.value === 'idle' || regenerate && ai.status.value !== 'generating')) await ai.generate(note); }
async function removeExpansion(id: string) {
  if (!confirm('删除这份 AI 拓写？原文将保留，相关拓写编辑草稿将清除。')) return;
  try { await deleteExpansion(id); ai.deleted(id); await load(); notify('拓写已删除'); } catch { error.value = '删除拓写失败，请重试'; }
}
let toastTimer: ReturnType<typeof setTimeout>;
function notify(message: string) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 3000); }
async function open(note?: Note, resume = false, expansion = false) {
  if (!resume && draft.value && !confirm('已有未完成的草稿。放弃草稿并开始这条记录？')) return;
  if (!resume && draft.value && !await discard()) return;
  kind.value = resume ? draft.value!.kind : expansion ? 'expansion' : 'note';
  content.value = resume ? draft.value!.content : expansion ? expansionFor(note!.id)!.content : note?.content ?? '';
  noteId.value = resume ? draft.value!.noteId : note?.id;
  error.value = ''; draftStatus.value = resume ? '草稿已恢复' : '输入后自动暂存草稿';
  isEditing.value = true; editor.value!.showModal(); await nextTick(); input.value?.focus();
}
function close() { editor.value!.close(); isEditing.value = false; }
async function collapse() { if (busy.value) return; if (await flush()) close(); }
async function cancel() { if (!busy.value && await discard()) close(); }
async function submit() { if (await save()) { close(); notify(kind.value === 'expansion' ? '拓写已保存' : '想法已保存'); if (kind.value === 'expansion' && noteId.value) ai.deleted(noteId.value); } }
function askDelete(note: Note) { selected.value = note; error.value = ''; deletion.value!.showModal(); }
async function confirmDelete() { if (selected.value && await remove(selected.value.id)) { ai.deleted(selected.value.id); deletion.value!.close(); notify('想法已删除'); } }
async function upgrade() {
  if ((isEditing.value || ai.status.value === 'generating' || ai.hasCandidate()) && !confirm('更新会暂存编辑草稿、中止生成，未保留的拓写会丢失。是否更新？')) return;
  if (isEditing.value && !await flush()) return;
  ai.cancel(); await updateApp(true);
}
function background() { if (document.hidden && isEditing.value && !busy.value) void flush(); }
async function persist() {
  try { storageMessage.value = await navigator.storage?.persist?.() ? '浏览器已允许持久化存储，仍请定期导出备份。' : '浏览器未授予持久化存储，请定期导出备份。'; }
  catch { storageMessage.value = '无法申请持久化存储，请定期导出备份。'; }
}
const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
onMounted(() => { void load(); document.addEventListener('visibilitychange', background); window.addEventListener('pagehide', ai.cancel); });
onUnmounted(() => { ai.cancel(); document.removeEventListener('visibilitychange', background); window.removeEventListener('pagehide', ai.cancel); clearTimeout(toastTimer); });
</script>

<template>
  <header class="site-header"><a class="brand" href="/">灵感清单</a><span class="edition">{{ offlineReady ? '可离线使用' : '随手记录，慢慢回看' }}</span></header>
  <main>
    <section class="intro"><div><h1>让想法，有个落脚点。</h1><p class="subtitle">不必完整，先记下来。</p></div><button class="primary new-button" :disabled="loading || !!loadError" @click="open()">＋ 记一下</button></section>
    <div v-if="needRefresh" class="notice" role="status">新版本已就绪，更新前会暂存正在输入的内容。<button class="text-button" @click="upgrade">更新应用</button></div>
    <p v-if="pwaError" role="status">{{ pwaError }}</p>
    <p v-if="error && !isEditing && !deletion?.open" role="alert" class="error">{{ error }}</p>
    <div v-if="draft && !isEditing" class="draft-banner"><button id="resume" @click="open(undefined, true)">有一段还没写完的想法 <span>继续写 →</span></button><button aria-label="放弃草稿" @click="discard">放弃</button></div>
    <section class="collection" aria-label="所有想法">
      <div class="list-heading"><h2>我的想法 <span id="count">{{ loading || loadError ? '—' : notes.length }}</span></h2><span>最近记录在前</span></div>
      <p v-if="loading" class="empty" role="status">正在读取本机记录…</p>
      <div v-else-if="loadError" class="empty"><p role="alert">{{ loadError }}</p><button class="secondary" @click="load">重新读取</button></div>
      <template v-else>
        <article v-for="note in notes" :key="note.id" class="note"><p>{{ note.content }}</p><div class="note-bottom"><time :datetime="new Date(note.createdAt).toISOString()">{{ formatTime(note.createdAt) }}</time><div class="note-actions"><button class="text-button" @click="open(note)">编辑</button><button class="text-button" @click="askDelete(note)">删除</button></div></div><details v-if="expansionFor(note.id)" class="saved-expansion"><summary>AI 拓写{{ expansionFor(note.id)!.editedByUser ? ' · 已编辑' : '' }}</summary><p v-if="expansionFor(note.id)!.sourceContent !== note.content" class="stale">原文已修改，拓写基于修改前的内容</p><p>{{ expansionFor(note.id)!.content }}</p><button class="text-button" @click="open(note, false, true)">编辑拓写</button><button class="text-button" @click="removeExpansion(note.id)">删除拓写</button></details></article>
        <div v-if="!notes.length" class="empty"><h2>第一条想法，留给此刻。</h2><p>一句话也好，一个还没成形的念头也好。</p><button class="text-button" @click="open()">记下第一个想法 →</button></div>
      </template>
    </section>
    <footer><p>原文与已保留拓写仅保存在{{ isAndroid ? '当前应用' : '当前设备和浏览器' }}；使用 AI 时，{{ isAndroid ? '当前原文由手机直接发送给你配置的 AI 接口。' : '当前原文会发送给 AI 接口及所接入服务。' }}</p><ApiSettings /><details><summary>{{ isAndroid ? '数据备份' : '数据备份与桌面安装' }}</summary><p>换浏览器、清理站点数据、卸载或系统回收存储可能导致记录丢失，不支持跨设备同步。请定期导出备份。</p><button class="secondary" :disabled="loading || !!loadError" @click="exportNotes">导出 JSON 备份</button><p>备份仅包含正式原文与已保留拓写，可能含有私人内容，请妥善保管。当前版本暂不支持导入。</p><button v-if="!isAndroid" class="text-button" @click="persist">申请持久化存储</button><p v-if="storageMessage" role="status">{{ storageMessage }}</p><p v-if="!isAndroid">添加到桌面：在安卓浏览器菜单中选择「安装应用」或「添加到主屏幕」。首次联网加载并完成缓存后可离线打开。不同浏览器的入口可能不同。</p></details></footer>
  </main>
  <dialog ref="editor" id="editor" aria-labelledby="editor-title" @cancel.prevent="collapse"><form @submit.prevent="submit"><div class="sheet-header"><h2 id="editor-title">{{ kind === 'expansion' ? '编辑 AI 拓写' : noteId ? '编辑想法' : '记下此刻的想法' }}</h2><button type="button" class="text-button" :disabled="busy" @click="collapse">收起</button></div><label for="content" class="sr-only">想法内容</label><textarea id="content" ref="input" v-model="content" :disabled="busy" placeholder="刚刚，你想到了什么？" @input="changed"></textarea><p v-if="orphanDraft" role="alert" class="error">目标已删除，请复制或取消编辑以放弃草稿。<button type="button" class="text-button" @click="copyDraft">复制内容</button></p><p v-if="error" role="alert" class="error">{{ error }}</p><div class="sheet-footer"><div><span id="draft-status" :role="draftStatus.includes('未保存') ? 'alert' : 'status'">{{ draftStatus }}</span><button type="button" class="text-button cancel" :disabled="busy" @click="cancel">取消编辑</button></div><div class="editor-actions"><button v-if="kind === 'note'" type="button" class="secondary" :disabled="openingAI || busy || orphanDraft || !content.trim()" @click="expandFromEditor">{{ expandLabel }}</button><button class="primary" :disabled="busy || orphanDraft || !content.trim()" type="submit">{{ busy ? '保存中…' : kind === 'expansion' ? '保存拓写' : '保存想法' }}</button></div></div></form></dialog>
  <dialog ref="deletion" class="confirm" aria-labelledby="delete-title" @cancel="busy && $event.preventDefault()"><h2 id="delete-title">删除这条想法？</h2><p>{{ selected && expansionFor(selected.id) ? '原文和已保留的 AI 拓写将一并删除，无法恢复。' : '删除后将无法恢复。' }}</p><p v-if="error" class="error" role="alert">{{ error }}</p><div class="confirm-actions"><button class="secondary" :disabled="busy" @click="deletion?.close()">保留想法</button><button class="danger" :disabled="busy" @click="confirmDelete">确认删除</button></div></dialog>
  <dialog ref="aiPanel" id="ai-panel" aria-labelledby="ai-title" @cancel.prevent="ai.visible.value = false">
    <div class="sheet-header"><h2 id="ai-title">AI 拓写</h2><button class="text-button" :disabled="!currentNote || ai.saving.value" @click="returnToEditor">返回编辑</button><button class="text-button" :disabled="ai.saving.value" @click="ai.visible.value = false">收起</button></div>
    <div class="ai-body"><h3>本次原文</h3><p class="ai-source">{{ ai.target.value?.content }}</p><p role="status">{{ ai.status.value === 'generating' ? '生成中…' : ai.status.value === 'ready' ? '已生成，尚未保留' : ai.status.value === 'saved' ? '已保留' : ai.status.value === 'cancelled' ? '已取消' : '等待生成' }}</p><p class="ai-output">{{ ai.text.value }}</p><p v-if="stale" class="stale">原文已修改，拓写基于修改前的内容。请按最新原文重新生成。</p><p v-if="ai.message.value" role="alert">{{ ai.message.value }}</p><p v-if="ai.config.value">服务商：{{ ai.config.value.provider }} · {{ ai.config.value.model }} <a :href="ai.config.value.policyUrl" target="_blank" rel="noreferrer">数据处理政策</a></p></div>
    <div class="sheet-footer ai-actions"><button v-if="ai.status.value === 'generating'" class="secondary" @click="ai.cancel">取消生成</button><template v-else><button v-if="ai.status.value === 'ready'" class="primary" :disabled="stale || ai.saving.value" @click="ai.retain(!!expansionFor(ai.target.value!.id))">{{ ai.saving.value ? '保留中…' : '保留拓写' }}</button><button class="secondary" :disabled="!currentNote || ai.saving.value" @click="currentNote && ai.generate(currentNote)">{{ ai.status.value === 'error' ? '重试' : '重新生成' }}</button></template><button class="text-button" :disabled="ai.saving.value" @click="ai.close">关闭</button></div>
  </dialog>
  <div v-if="toast" id="toast" role="status">{{ toast }}</div>
</template>
