import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { notes } from "../db/schema";
import { authenticate } from "../middleware/auth";

// Validation schemas
const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(50000),
});

const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(50000).optional(),
});

export async function notesRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook("preHandler", authenticate);

  /**
   * GET /notes
   * Get all notes for the authenticated user
   */
  fastify.get("/", async (request, reply) => {
    const userId = (request.user as any).userId;

    const userNotes = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.deleted, false)))
      .orderBy(desc(notes.updatedAt));

    // Convert dates to ISO strings
    const serializedNotes = userNotes.map((note) => ({
      ...note,
      updatedAt: note.updatedAt.toISOString(),
      createdAt: note.createdAt.toISOString(),
    }));

    return reply.send(serializedNotes);
  });

  /**
   * GET /notes/:id
   * Get a specific note by ID
   */
  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params;

    const [note] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.id, id),
          eq(notes.userId, userId),
          eq(notes.deleted, false)
        )
      )
      .limit(1);

    if (!note) {
      return reply.code(404).send({
        error: "Not Found",
        message: "Note not found",
      });
    }

    return reply.send({
      ...note,
      updatedAt: note.updatedAt.toISOString(),
      createdAt: note.createdAt.toISOString(),
    });
  });

  /**
   * POST /notes
   * Create a new note
   */
  fastify.post<{ Body: z.infer<typeof createNoteSchema> }>(
    "/",
    async (request, reply) => {
      try {
        const userId = (request.user as any).userId;
        const { title, content } = createNoteSchema.parse(request.body);

        const [note] = await db
          .insert(notes)
          .values({
            userId,
            title,
            content,
            version: 1,
          })
          .returning();

        return reply.code(201).send({
          ...note!,
          updatedAt: note!.updatedAt.toISOString(),
          createdAt: note!.createdAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            message: error.issues,
          });
        }
        throw error;
      }
    }
  );

  /**
   * PUT /notes/:id
   * Update an existing note
   */
  fastify.put<{
    Params: { id: string };
    Body: z.infer<typeof updateNoteSchema>;
  }>("/:id", async (request, reply) => {
    try {
      const userId = (request.user as any).userId;
      const { id } = request.params;
      const data = updateNoteSchema.parse(request.body);

      // Check if note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.userId, userId),
            eq(notes.deleted, false)
          )
        )
        .limit(1);

      if (!existingNote) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Note not found",
        });
      }

      // Update note and increment version
      const [updatedNote] = await db
        .update(notes)
        .set({
          ...data,
          version: existingNote.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(notes.id, id))
        .returning();

      return reply.send({
        ...updatedNote!,
        updatedAt: updatedNote!.updatedAt.toISOString(),
        createdAt: updatedNote!.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: "Validation Error",
          message: error.issues,
        });
      }
      throw error;
    }
  });

  /**
   * DELETE /notes/:id
   * Soft delete a note (mark as deleted)
   */
  fastify.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userId = (request.user as any).userId;
    const { id } = request.params;

    // Check if note exists and belongs to user
    const [existingNote] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.id, id),
          eq(notes.userId, userId),
          eq(notes.deleted, false)
        )
      )
      .limit(1);

    if (!existingNote) {
      return reply.code(404).send({
        error: "Not Found",
        message: "Note not found",
      });
    }

    // Soft delete
    await db
      .update(notes)
      .set({
        deleted: true,
        version: existingNote.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, id));

    return reply.code(204).send();
  });
}

