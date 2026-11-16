<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useNotes } from './composables/useNotes';
import { offlineReady, needRefresh, pwaError, updateApp } from './pwa';
import type { Note } from './db';
const { notes, draft, loading, loadError, error, busy, content, noteId, draftStatus, load, flush, changed, discard, save, remove, exportNotes } = useNotes();
const editor = ref<HTMLDialogElement>(), deletion = ref<HTMLDialogElement>(), input = ref<HTMLTextAreaElement>();
const selected = ref<Note>(), toast = ref(''), isEditing = ref(false), storageMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout>;
function notify(message: string) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 3000); }
async function open(note?: Note, resume = false) {
  if (!resume && draft.value && !confirm('已有未完成的草稿。放弃草稿并开始这条记录？')) return;
  if (!resume && draft.value && !await discard()) return;
  content.value = resume ? draft.value!.content : note?.content ?? '';
  noteId.value = resume ? draft.value!.noteId : note?.id;
  error.value = ''; draftStatus.value = resume ? '草稿已恢复' : '输入后自动暂存草稿';
  isEditing.value = true; editor.value!.showModal(); await nextTick(); input.value?.focus();
}
function close() { editor.value!.close(); isEditing.value = false; }
async function collapse() { if (busy.value) return; if (await flush()) close(); }
async function cancel() { if (!busy.value && await discard()) close(); }
async function submit() { if (await save()) { close(); notify('想法已保存'); } }
function askDelete(note: Note) { selected.value = note; error.value = ''; deletion.value!.showModal(); }
async function confirmDelete() { if (selected.value && await remove(selected.value.id)) { deletion.value!.close(); notify('想法已删除'); } }
async function upgrade() {
  if (isEditing.value && !await flush()) return;
  await updateApp(true);
}
function background() { if (document.hidden && isEditing.value && !busy.value) void flush(); }
async function persist() {
  try { storageMessage.value = await navigator.storage?.persist?.() ? '浏览器已允许持久化存储，仍请定期导出备份。' : '浏览器未授予持久化存储，请定期导出备份。'; }
  catch { storageMessage.value = '无法申请持久化存储，请定期导出备份。'; }
}
const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
onMounted(() => { void load(); document.addEventListener('visibilitychange', background); });
onUnmounted(() => { document.removeEventListener('visibilitychange', background); clearTimeout(toastTimer); });
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
        <article v-for="note in notes" :key="note.id" class="note"><p>{{ note.content }}</p><div class="note-bottom"><time :datetime="new Date(note.createdAt).toISOString()">{{ formatTime(note.createdAt) }}</time><div class="note-actions"><button class="text-button" @click="open(note)">编辑</button><button class="text-button" @click="askDelete(note)">删除</button></div></div></article>
        <div v-if="!notes.length" class="empty"><h2>第一条想法，留给此刻。</h2><p>一句话也好，一个还没成形的念头也好。</p><button class="text-button" @click="open()">记下第一个想法 →</button></div>
      </template>
    </section>
    <footer><p>仅保存在当前设备和浏览器</p><details><summary>数据备份与桌面安装</summary><p>换浏览器、清理站点数据、卸载或系统回收存储可能导致记录丢失，不支持跨设备同步。请定期导出备份。</p><button class="secondary" :disabled="loading || !!loadError" @click="exportNotes">导出 JSON 备份</button><p>备份仅包含已保存的记录，可能含有私人内容，请妥善保管。当前版本暂不支持导入。</p><button class="text-button" @click="persist">申请持久化存储</button><p v-if="storageMessage" role="status">{{ storageMessage }}</p><p>添加到桌面：在安卓浏览器菜单中选择「安装应用」或「添加到主屏幕」。首次联网加载并完成缓存后可离线打开。不同浏览器的入口可能不同。</p></details></footer>
  </main>
  <dialog ref="editor" id="editor" aria-labelledby="editor-title" @cancel.prevent="collapse"><form @submit.prevent="submit"><div class="sheet-header"><h2 id="editor-title">{{ noteId ? '编辑想法' : '记下此刻的想法' }}</h2><button type="button" class="text-button" :disabled="busy" @click="collapse">收起</button></div><label for="content" class="sr-only">想法内容</label><textarea id="content" ref="input" v-model="content" :disabled="busy" placeholder="刚刚，你想到了什么？" @input="changed"></textarea><p v-if="error" role="alert" class="error">{{ error }}</p><div class="sheet-footer"><div><span id="draft-status" :role="draftStatus.includes('未保存') ? 'alert' : 'status'">{{ draftStatus }}</span><button type="button" class="text-button cancel" :disabled="busy" @click="cancel">取消编辑</button></div><button class="primary" :disabled="busy || !content.trim()" type="submit">{{ busy ? '保存中…' : '保存想法' }}</button></div></form></dialog>
  <dialog ref="deletion" class="confirm" aria-labelledby="delete-title" @cancel="busy && $event.preventDefault()"><h2 id="delete-title">删除这条想法？</h2><p>删除后将无法恢复。</p><p v-if="error" class="error" role="alert">{{ error }}</p><div class="confirm-actions"><button class="secondary" :disabled="busy" @click="deletion?.close()">保留想法</button><button class="danger" :disabled="busy" @click="confirmDelete">确认删除</button></div></dialog>
  <div v-if="toast" id="toast" role="status">{{ toast }}</div>
</template>
