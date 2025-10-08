import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { notes } from '../db/schema';
import { authenticate } from '../middleware/auth';
import type { SyncRequest, SyncResponse, ConflictData, Note } from '../types';

// Validation schema for sync request
const syncSchema = z.object({
  clientId: z.string(),
  lastSyncAt: z.string().optional(),
  changes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
      updatedAt: z.string(),
      deleted: z.boolean(),
      version: z.number(),
    })
  ),
});

export async function syncRoutes(fastify: FastifyInstance) {
  // Require authentication for all sync routes
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /sync
   * Main synchronization endpoint
   * 
   * Process:
   * 1. Receive client changes with timestamps and versions
   * 2. For each change:
   *    - If note doesn't exist on server → create it (use client's ID)
   *    - If note exists → compare timestamps:
   *      - Client newer → apply client change (last-write-wins)
   *      - Server newer → create conflict record
   *      - Equal timestamps → compare versions, higher wins
   * 3. Increment version on all applied changes
   * 4. Return applied changes, conflicts, and server changes since lastSyncAt
   */
  fastify.post<{ Body: SyncRequest }>('/', async (request, reply) => {
    try {
      const userId = (request.user as any).userId;
      const { clientId, lastSyncAt, changes } = syncSchema.parse(request.body);

      const applied: string[] = [];
      const conflicts: ConflictData[] = [];
      const serverTime = new Date().toISOString();

      // Process each client change
      for (const change of changes) {
        try {
          // Check if note exists on server
          const [serverNote] = await db
            .select()
            .from(notes)
            .where(and(eq(notes.id, change.id), eq(notes.userId, userId)))
            .limit(1);

          if (!serverNote) {
            // Note doesn't exist on server - create it
            await db.insert(notes).values({
              id: change.id,
              userId,
              title: change.title,
              content: change.content,
              deleted: change.deleted,
              version: change.version,
              updatedAt: new Date(change.updatedAt),
              createdAt: new Date(change.updatedAt),
            });
            applied.push(change.id);
          } else {
            // Note exists - check for conflicts
            const serverUpdatedAt = new Date(serverNote.updatedAt);
            const clientUpdatedAt = new Date(change.updatedAt);

            // Compare timestamps for conflict detection
            if (clientUpdatedAt > serverUpdatedAt) {
              // Client is newer - apply client change (last-write-wins)
              await db
                .update(notes)
                .set({
                  title: change.title,
                  content: change.content,
                  deleted: change.deleted,
                  version: Math.max(serverNote.version, change.version) + 1,
                  updatedAt: clientUpdatedAt,
                })
                .where(eq(notes.id, change.id));
              applied.push(change.id);
            } else if (serverUpdatedAt > clientUpdatedAt) {
              // Server is newer - conflict detected
              conflicts.push({
                id: change.id,
                server: {
                  id: serverNote.id,
                  userId: serverNote.userId,
                  title: serverNote.title,
                  content: serverNote.content,
                  updatedAt: serverNote.updatedAt.toISOString(),
                  createdAt: serverNote.createdAt.toISOString(),
                  deleted: serverNote.deleted,
                  version: serverNote.version,
                },
                client: change,
              });
            } else {
              // Timestamps are equal - compare versions
              if (change.version > serverNote.version) {
                // Client version is higher - apply client change
                await db
                  .update(notes)
                  .set({
                    title: change.title,
                    content: change.content,
                    deleted: change.deleted,
                    version: change.version + 1,
                    updatedAt: new Date(),
                  })
                  .where(eq(notes.id, change.id));
                applied.push(change.id);
              } else if (serverNote.version > change.version) {
                // Server version is higher - conflict
                conflicts.push({
                  id: change.id,
                  server: {
                    id: serverNote.id,
                    userId: serverNote.userId,
                    title: serverNote.title,
                    content: serverNote.content,
                    updatedAt: serverNote.updatedAt.toISOString(),
                    createdAt: serverNote.createdAt.toISOString(),
                    deleted: serverNote.deleted,
                    version: serverNote.version,
                  },
                  client: change,
                });
              } else {
                // Same version and timestamp - no change needed
                // This shouldn't happen in normal operation
                applied.push(change.id);
              }
            }
          }
        } catch (error) {
          fastify.log.error(
            `Error processing change for note ${change.id}: ${error instanceof Error ? error.message : String(error)}`
          );
          // Continue processing other changes
        }
      }

      // Get server changes since lastSyncAt
      let serverChanges: Note[] = [];
      if (lastSyncAt) {
        const lastSyncDate = new Date(lastSyncAt);
        const changedNotes = await db
          .select()
          .from(notes)
          .where(
            and(eq(notes.userId, userId), gt(notes.updatedAt, lastSyncDate))
          )
          .orderBy(notes.updatedAt);

        serverChanges = changedNotes.map((note) => ({
          id: note.id,
          userId: note.userId,
          title: note.title,
          content: note.content,
          updatedAt: note.updatedAt.toISOString(),
          createdAt: note.createdAt.toISOString(),
          deleted: note.deleted,
          version: note.version,
        }));
      }

      const response: SyncResponse = {
        applied,
        conflicts,
        serverChanges,
        serverTime,
      };

      return reply.send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: error.issues,
        });
      }
      throw error;
    }
  });

  /**
   * POST /sync/resolve
   * Resolve a conflict by accepting a specific version
   */
  fastify.post<{
    Body: {
      noteId: string;
      resolution: 'server' | 'client' | 'manual';
      manualData?: {
        title: string;
        content: string;
      };
    };
  }>('/resolve', async (request, reply) => {
    try {
      const userId = (request.user as any).userId;
      const { noteId, resolution, manualData } = request.body;

      const [note] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
        .limit(1);

      if (!note) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Note not found',
        });
      }

      if (resolution === 'server') {
        // Keep server version - just increment version
        await db
          .update(notes)
          .set({
            version: note.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(notes.id, noteId));
      } else if (resolution === 'manual' && manualData) {
        // Apply manual resolution
        await db
          .update(notes)
          .set({
            title: manualData.title,
            content: manualData.content,
            version: note.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(notes.id, noteId));
      }

      const [updatedNote] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId))
        .limit(1);

      return reply.send({
        ...updatedNote!,
        updatedAt: updatedNote!.updatedAt.toISOString(),
        createdAt: updatedNote!.createdAt.toISOString(),
      });
    } catch (error) {
      throw error;
    }
  });
}