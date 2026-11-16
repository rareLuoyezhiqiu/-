import Dexie, { type Table } from 'dexie';
export interface Note { id: string; content: string; createdAt: number; updatedAt: number }
export interface Draft { id: 'active'; noteId?: string; content: string; updatedAt: number }
class Database extends Dexie {
  notes!: Table<Note, string>;
  drafts!: Table<Draft, string>;
  constructor() {
    super('inspiration-list');
    this.version(1).stores({ notes: 'id,createdAt', drafts: 'id' });
    this.version(2).stores({ notes: 'id,createdAt,updatedAt', drafts: 'id' }).upgrade(tx =>
      tx.table('notes').toCollection().modify(note => { note.updatedAt ??= note.createdAt; }));
  }
}
const db = new Database();
export const openDatabase = () => db.open();
export const listNotes = async () => (await db.notes.toArray()).sort((a,b) => b.createdAt-a.createdAt || b.id.localeCompare(a.id));
export const getDraft = () => db.drafts.get('active');
export const putDraft = (draft: Draft) => db.drafts.put(draft);
export const clearDraft = () => db.drafts.delete('active');
export async function saveNote(content: string, noteId?: string) {
  if (!content.trim()) throw Error('empty');
  return db.transaction('rw', db.notes, db.drafts, async () => {
    const previous = noteId ? await db.notes.get(noteId) : undefined;
    if (noteId && !previous) throw Error('记录已被删除，请复制正文后新建');
    const now = Date.now();
    const note: Note = { id: noteId ?? crypto.randomUUID(), content, createdAt: previous?.createdAt ?? now, updatedAt: now };
    await db.notes.put(note);
    await db.drafts.delete('active');
    return note;
  });
}
export const deleteNote = (id: string) => db.transaction('rw', db.notes, db.drafts, async () => {
  await db.notes.delete(id);
  if ((await getDraft())?.noteId === id) await clearDraft();
});
