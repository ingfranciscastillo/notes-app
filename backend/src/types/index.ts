export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  updatedAt: string;
  createdAt: string;
  deleted: boolean;
  version: number;
}

export interface NoteChange {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  deleted: boolean;
  version: number;
}

export interface SyncRequest {
  clientId: string;
  lastSyncAt?: string;
  changes: NoteChange[];
}

export interface ConflictData {
  id: string;
  server: Note;
  client: NoteChange;
}

export interface SyncResponse {
  applied: string[];
  conflicts: ConflictData[];
  serverChanges: Note[];
  serverTime: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}