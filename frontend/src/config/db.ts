import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Note, SyncQueueItem } from '../types';

/**
 * IndexedDB Schema
 */
interface NotesDB extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { 'by-updated': string };
  };
  syncQueue: {
    key: number;
    value: SyncQueueItem;
    autoIncrement: true;
  };
  meta: {
    key: string;
    value: string;
  };
}

const DB_NAME = 'notesapp';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<NotesDB> | null = null;

/**
 * Initialize and open IndexedDB
 */
export async function initDB(): Promise<IDBPDatabase<NotesDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<NotesDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Notes store
      if (!db.objectStoreNames.contains('notes')) {
        const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
        notesStore.createIndex('by-updated', 'updatedAt');
      }

      // Sync queue store
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
      }

      // Meta store for lastSyncAt, clientId, etc.
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    },
  });

  return dbInstance;
}

/**
 * Get all notes from IndexedDB
 */
export async function getAllNotes(): Promise<Note[]> {
  const db = await initDB();
  const notes = await db.getAll('notes');
  return notes.filter((note) => !note.deleted).sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Get a single note by ID
 */
export async function getNote(id: string): Promise<Note | undefined> {
  const db = await initDB();
  return db.get('notes', id);
}

/**
 * Save a note to IndexedDB
 */
export async function saveNote(note: Note): Promise<void> {
  const db = await initDB();
  await db.put('notes', note);
}

/**
 * Delete a note from IndexedDB (soft delete)
 */
export async function deleteNote(id: string): Promise<void> {
  const db = await initDB();
  const note = await db.get('notes', id);
  if (note) {
    note.deleted = true;
    note.updatedAt = new Date().toISOString();
    note.version++;
    await db.put('notes', note);
  }
}

/**
 * Add a change to the sync queue
 */
export async function queueChange(
  noteId: string,
  operation: 'create' | 'update' | 'delete',
  data: Note
): Promise<void> {
  const db = await initDB();
  const item: SyncQueueItem = {
    noteId,
    operation,
    data,
    timestamp: new Date().toISOString(),
  };
  await db.add('syncQueue', item);
}

/**
 * Get all pending changes from sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await initDB();
  return db.getAll('syncQueue');
}

/**
 * Clear sync queue after successful sync
 */
export async function clearSyncQueue(): Promise<void> {
  const db = await initDB();
  await db.clear('syncQueue');
}

/**
 * Remove specific items from sync queue
 */
export async function removeFromSyncQueue(ids: number[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

/**
 * Apply server changes to local database
 */
export async function applyServerChanges(notes: Note[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('notes', 'readwrite');
  
  for (const note of notes) {
    const existing = await tx.store.get(note.id);
    
    // Only apply if server version is newer or note doesn't exist
    if (!existing || new Date(note.updatedAt) > new Date(existing.updatedAt)) {
      await tx.store.put(note);
    }
  }
  
  await tx.done;
}

/**
 * Get metadata value
 */
export async function getMeta(key: string): Promise<string | undefined> {
  const db = await initDB();
  return db.get('meta', key);
}

/**
 * Set metadata value
 */
export async function setMeta(key: string, value: string): Promise<void> {
  const db = await initDB();
  await db.put('meta', value, key);
}

/**
 * Get or create client ID
 */
export async function getClientId(): Promise<string> {
  let clientId = await getMeta('clientId');
  if (!clientId) {
    clientId = crypto.randomUUID();
    await setMeta('clientId', clientId);
  }
  return clientId;
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncAt(): Promise<string | undefined> {
  return getMeta('lastSyncAt');
}

/**
 * Set last sync timestamp
 */
export async function setLastSyncAt(timestamp: string): Promise<void> {
  return setMeta('lastSyncAt', timestamp);
}

/**
 * Create a new note locally
 */
export async function createNoteLocally(
  title: string,
  content: string
): Promise<Note> {
  const now = new Date().toISOString();
  const note: Note = {
    id: crypto.randomUUID(),
    title,
    content,
    updatedAt: now,
    createdAt: now,
    version: 1,
    deleted: false,
  };

  await saveNote(note);
  await queueChange(note.id, 'create', note);

  return note;
}

/**
 * Update a note locally
 */
export async function updateNoteLocally(
  id: string,
  title: string,
  content: string
): Promise<Note | null> {
  const note = await getNote(id);
  if (!note) return null;

  note.title = title;
  note.content = content;
  note.updatedAt = new Date().toISOString();
  note.version++;

  await saveNote(note);
  await queueChange(id, 'update', note);

  return note;
}

/**
 * Delete a note locally (soft delete)
 */
export async function deleteNoteLocally(id: string): Promise<void> {
  const note = await getNote(id);
  if (!note) return;

  note.deleted = true;
  note.updatedAt = new Date().toISOString();
  note.version++;

  await saveNote(note);
  await queueChange(id, 'delete', note);
}