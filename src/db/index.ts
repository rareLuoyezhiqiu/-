import Dexie, { liveQuery, type Table } from 'dexie';
export interface Note { id: string; content: string; createdAt: number; updatedAt: number }
export interface Draft { id: 'active'; kind: 'note' | 'expansion'; noteId?: string; content: string; updatedAt: number }
export interface Expansion { noteId: string; content: string; sourceContent: string; generatedAt: number; createdAt: number; updatedAt: number; editedByUser: boolean }
class Database extends Dexie {
  notes!: Table<Note, string>;
  drafts!: Table<Draft, string>;
  expansions!: Table<Expansion, string>;
  constructor() {
    super('inspiration-list');
    this.version(1).stores({ notes: 'id,createdAt', drafts: 'id' });
    this.version(2).stores({ notes: 'id,createdAt,updatedAt', drafts: 'id' }).upgrade(tx =>
      tx.table('notes').toCollection().modify(note => { note.updatedAt ??= note.createdAt; }));
    this.version(3).stores({ notes: 'id,createdAt,updatedAt', drafts: 'id', expansions: 'noteId,updatedAt' }).upgrade(tx =>
      tx.table('drafts').toCollection().modify(draft => { draft.kind ??= 'note'; }));
  }
}
const db = new Database();
export const openDatabase = () => db.open();
export const listNotes = async () => (await db.notes.toArray()).sort((a,b) => b.createdAt-a.createdAt || b.id.localeCompare(a.id));
export const getDraft = () => db.drafts.get('active');
export const putDraft = (draft: Draft) => db.drafts.put(draft);
export const clearDraft = () => db.drafts.delete('active');
export const discardDraft = (draft: Draft) => db.transaction('rw', db.drafts, () => clearMatchingDraft(draft.kind, draft.noteId));
export async function saveNote(content: string, noteId?: string) {
  if (!content.trim()) throw Error('empty');
  return db.transaction('rw', db.notes, db.drafts, async () => {
    const previous = noteId ? await db.notes.get(noteId) : undefined;
    if (noteId && !previous) throw Error('记录已被删除，请复制正文后新建');
    const now = Date.now();
    const note: Note = { id: noteId ?? crypto.randomUUID(), content, createdAt: previous?.createdAt ?? now, updatedAt: now };
    await db.notes.put(note);
    await clearMatchingDraft('note', noteId);
    return note;
  });
}
export const deleteNote = (id: string) => db.transaction('rw', db.notes, db.drafts, db.expansions, async () => {
  await db.notes.delete(id);
  await db.expansions.delete(id);
  if ((await getDraft())?.noteId === id) await clearDraft();
});
async function clearMatchingDraft(kind: Draft['kind'], noteId?: string) {
  const draft = await getDraft();
  if (draft?.kind === kind && draft.noteId === noteId) await clearDraft();
}
export const listExpansions = () => db.expansions.toArray();
export function retainExpansion(noteId: string, content: string, sourceContent: string, generatedAt: number) {
  if (!content.trim()) throw Error('拓写为空');
  return db.transaction('rw', db.notes, db.expansions, async () => {
    const note = await db.notes.get(noteId);
    if (!note || note.content !== sourceContent) throw Error('原文已修改或删除，请按最新原文重新生成');
    const previous = await db.expansions.get(noteId), now = Date.now();
    await db.expansions.put({ noteId, content, sourceContent, generatedAt, createdAt: previous?.createdAt ?? now, updatedAt: now, editedByUser: false });
  });
}
export function editExpansion(noteId: string, content: string) {
  if (!content.trim()) throw Error('拓写为空');
  return db.transaction('rw', db.notes, db.expansions, db.drafts, async () => {
    const previous = await db.expansions.get(noteId);
    if (!previous || !await db.notes.get(noteId)) throw Error('目标已删除，请复制内容后放弃草稿');
    await db.expansions.put({ ...previous, content, updatedAt: Date.now(), editedByUser: true });
    await clearMatchingDraft('expansion', noteId);
  });
}
export const deleteExpansion = (noteId: string) => db.transaction('rw', db.expansions, db.drafts, async () => {
  await db.expansions.delete(noteId); await clearMatchingDraft('expansion', noteId);
});
export const exportData = () => db.transaction('r', db.notes, db.expansions, async () => {
  const notes = await listNotes(), ids = new Set(notes.map(n => n.id));
  return { formatVersion: 2, exportedAt: new Date().toISOString(), notes, expansions: (await listExpansions()).filter(e => ids.has(e.noteId)) };
});

export const watchRecords = (next: (data: [Note[], Expansion[]]) => void, error: () => void) => liveQuery(async (): Promise<[Note[], Expansion[]]> => [await listNotes(), await listExpansions()]).subscribe({ next, error });
