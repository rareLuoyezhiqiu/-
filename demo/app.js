const $ = (id) => document.getElementById(id);
const STORE = 'inspiration-demo-notes-v1';
const DRAFT = 'inspiration-demo-draft-v1';
const now = Date.now();
const examples = [
  ['散步的时候不戴耳机，试着收集一路上听到的声音。也许能做成一份自己的城市声音地图。', now - 20 * 60000],
  ['想做一个只在周末营业的小书店。\n书不多，但每一本都附上一张手写的推荐卡。', now - 3 * 3600000],
  ['把每天拍的天空放在一起，一年之后，会是什么样的颜色？', now - 86400000],
  ['下次和朋友见面，带一个最近想不明白的问题，交换着聊一聊。', now - 2 * 86400000],
];
let notes = [];
let draft = null;
let editing = null;
let deleting = null;
let timer;
function message(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('toast').hidden = true, 2400); }
function persist(next) { localStorage.setItem(STORE, JSON.stringify(next)); notes = next; }
try {
  const saved = localStorage.getItem(STORE);
  const parsed = saved ? JSON.parse(saved) : examples.map(([text, createdAt], i) => ({ id: `sample-${i}`, text, createdAt }));
  if (!Array.isArray(parsed) || !parsed.every(n => typeof n.id === 'string' && typeof n.text === 'string' && Number.isFinite(n.createdAt))) throw Error('Invalid data');
  notes = parsed;
  if (!saved) persist(notes);
} catch { message('浏览器数据暂时无法读取，请检查存储设置。'); }
try {
  const parsed = JSON.parse(localStorage.getItem(DRAFT));
  if (parsed && typeof parsed.text === 'string' && (parsed.id === null || notes.some(n => n.id === parsed.id))) draft = parsed;
} catch { /* Leave saved records intact if draft storage is unavailable. */ }
const date = new Intl.DateTimeFormat('zh-CN', { month:'long', day:'numeric', weekday:'long' });
$('today').textContent = date.format(new Date());
function timestamp(value) {
  const d = new Date(value);
  const isToday = d.toDateString() === new Date().toDateString();
  return `${isToday ? '今天' : `${d.getMonth()+1}月${d.getDate()}日`} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function render() {
  $('list').replaceChildren();
  for (const note of [...notes].sort((a,b) => b.createdAt - a.createdAt)) {
    const article = document.createElement('article'); article.className = 'note';
    const content = document.createElement('p'); content.textContent = note.text;
    const bottom = document.createElement('div'); bottom.className = 'note-bottom';
    const time = document.createElement('time'); time.dateTime = new Date(note.createdAt).toISOString(); time.textContent = timestamp(note.createdAt);
    const actions = document.createElement('div'); actions.className = 'note-actions';
    for (const [text, action] of [['编辑', () => openEditor(note)], ['删除', () => { deleting = note.id; $('delete-dialog').showModal(); }]]) {
      const button = document.createElement('button'); button.className = 'text-button'; button.textContent = text; button.onclick = action; actions.append(button);
    }
    bottom.append(time, actions); article.append(content, bottom); $('list').append(article);
  }
  $('count').textContent = `${notes.length} 条`;
  $('empty').hidden = notes.length > 0;
  $('resume').hidden = !draft || !draft.text.trim();
}
function openEditor(note = null, restore = false) {
  // Keep the outstanding draft discoverable rather than silently replacing it.
  if (draft && !restore && (draft.id !== (note?.id ?? null))) {
    if (!window.confirm('还有一段未完成的想法。放弃草稿并继续？')) return;
    try { localStorage.removeItem(DRAFT); } catch { message('无法清除草稿，请检查存储设置。'); return; }
    draft = null;
  }
  editing = restore ? draft.id : note?.id ?? null;
  $('content').value = restore ? draft.text : (draft && draft.id === editing ? draft.text : note?.text ?? '');
  $('editor-title').textContent = editing ? '编辑想法' : '记下此刻的想法';
  $('save-error').hidden = true;
  $('save').disabled = !$('content').value.trim();
  $('draft-status').textContent = draft && draft.id === editing ? '已恢复未完成的内容' : editing ? '修改后，记得保存。' : '不必想好标题，一句话就可以。';
  $('editor').showModal(); $('content').focus();
}
$('new').onclick = () => openEditor();
$('empty-new').onclick = () => openEditor();
$('resume').onclick = () => openEditor(null, true);
$('close').onclick = () => { $('editor').close(); render(); };
$('editor').addEventListener('cancel', () => render());
$('content').addEventListener('input', () => {
  const text = $('content').value;
  $('save').disabled = !text.trim();
  draft = { id: editing, text };
  try {
    if (text) localStorage.setItem(DRAFT, JSON.stringify(draft));
    else { localStorage.removeItem(DRAFT); draft = null; }
    $('draft-status').textContent = text ? '草稿已暂存' : '不必想好标题，一句话就可以。';
  } catch { $('draft-status').textContent = '草稿暂存失败，请勿关闭页面'; }
});
$('editor-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('content').value.trim();
  if (!text) return;
  const next = editing ? notes.map(n => n.id === editing ? { ...n, text } : n) : [{ id: crypto.randomUUID?.() ?? `note-${Date.now()}-${Math.random().toString(36).slice(2)}`, text, createdAt: Date.now() }, ...notes];
  try { persist(next); }
  catch { $('save-error').textContent = '保存失败，内容还在。请检查浏览器存储设置后重试。'; $('save-error').hidden = false; return; }
  draft = null;
  try { localStorage.removeItem(DRAFT); } catch { /* The record itself has already been saved. */ }
  $('editor').close(); render(); message(editing ? '想法已更新' : '想法已保存');
});
$('cancel-delete').onclick = () => $('delete-dialog').close();
$('confirm-delete').onclick = () => {
  try {
    persist(notes.filter(n => n.id !== deleting));
    if (draft?.id === deleting) { draft = null; try { localStorage.removeItem(DRAFT); } catch {} }
    $('delete-dialog').close(); render(); message('想法已删除');
  } catch { message('删除失败，请重试。'); }
};
render();
