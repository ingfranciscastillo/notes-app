export interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  createdAt: string;
  version: number;
  deleted: boolean;
}

export interface NoteChange {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  deleted: boolean;
  version: number;
}

export interface SyncQueueItem {
  id?: number;
  noteId: string;
  operation: "create" | "update" | "delete";
  data: Note;
  timestamp: string;
}

export interface ConflictData {
  id: string;
  server: Note;
  client: NoteChange;
}

export interface SyncRequest {
  clientId: string;
  lastSyncAt?: string;
  changes: NoteChange[];
}

export interface SyncResponse {
  applied: string[];
  conflicts: ConflictData[];
  serverChanges: Note[];
  serverTime: string;
}

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
