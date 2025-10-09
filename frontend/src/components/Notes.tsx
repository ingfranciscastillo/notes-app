import { useState, useEffect } from "preact/hooks";
import type { Note } from "../types";
import {
  getAllNotes,
  createNoteLocally,
  updateNoteLocally,
  deleteNoteLocally,
} from "../config/db";
import { auth } from "../config/auth";
import { useSync } from "../hooks/useSync";
import { SyncIndicator } from "./SyncIndicator";
import { NoteEditor } from "./NoteEditor";
import { ConflictResolver } from "./ConflictResolver";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { isSyncing, lastSyncAt, conflicts, syncNow, clearConflicts } =
    useSync();

  // Load notes on mount and after sync
  const loadNotes = async () => {
    const loadedNotes = await getAllNotes();
    setNotes(loadedNotes);
  };

  useEffect(() => {
    loadNotes();

    // Reload notes periodically to show changes
    const interval = setInterval(loadNotes, 2000);
    return () => clearInterval(interval);
  }, []);

  // Reload notes after sync
  useEffect(() => {
    if (!isSyncing) {
      loadNotes();
    }
  }, [isSyncing]);

  const handleCreateNote = () => {
    setSelectedNote(null);
    setIsEditorOpen(true);
  };

  const handleEditNote = (note: Note) => {
    setSelectedNote(note);
    setIsEditorOpen(true);
  };

  const handleSaveNote = async (title: string, content: string) => {
    if (selectedNote) {
      await updateNoteLocally(selectedNote.id, title, content);
    } else {
      await createNoteLocally(title, content);
    }
    setIsEditorOpen(false);
    setSelectedNote(null);
    await loadNotes();

    // Trigger sync after save
    if (navigator.onLine) {
      syncNow();
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (confirm("Are you sure you want to delete this note?")) {
      await deleteNoteLocally(id);
      await loadNotes();

      // Trigger sync after delete
      if (navigator.onLine) {
        syncNow();
      }
    }
  };

  const handleLogout = async () => {
    if (confirm("Are you sure you want to logout?")) {
      await auth.logout();
      window.location.reload();
    }
  };

  const handleConflictResolve = async () => {
    clearConflicts();
    await loadNotes();
    // Trigger another sync to apply resolved conflicts
    syncNow();
  };

  // Filter notes based on search query
  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div class="min-h-screen bg-gray-50">
      {/* Header */}
      <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-gray-900">
                <img src={"/favicon.svg"} className={"size-8"} />
              </h1>
              <span class="text-sm text-gray-500">
                {notes.length} {notes.length === 1 ? "note" : "notes"}
              </span>
            </div>
            <div class="flex items-center gap-4">
              <SyncIndicator
                isSyncing={isSyncing}
                lastSyncAt={lastSyncAt}
                onSync={syncNow}
              />
              <Button variant="ghost" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>

          {/* Search and Create */}
          <div class="flex gap-3">
            <div class="flex-1 relative">
              <Input
                type="text"
                value={searchQuery}
                onInput={(e: Event) =>
                  setSearchQuery((e.target as HTMLInputElement).value)
                }
                placeholder="Search notes..."
                class="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <svg
                class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <Button
              onClick={handleCreateNote}
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition flex items-center gap-2 whitespace-nowrap"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Note
            </Button>
          </div>
        </div>
      </header>

      {/* Conflict Alert */}
      {conflicts.length > 0 && (
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <svg
                class="w-6 h-6 text-yellow-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p class="font-medium text-yellow-900">
                  {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""}{" "}
                  detected
                </p>
                <p class="text-sm text-yellow-700">
                  Some notes have conflicting changes that need to be resolved
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes Grid */}
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filteredNotes.length === 0 ? (
          <div class="text-center py-12">
            <svg
              class="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900">No notes</h3>
            <p class="mt-1 text-sm text-gray-500">
              {searchQuery
                ? "No notes match your search"
                : "Get started by creating a new note"}
            </p>
            {!searchQuery && (
              <Button
                onClick={handleCreateNote}
                class="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Create your first note
              </Button>
            )}
          </div>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                class="bg-white rounded-lg shadow hover:shadow-md transition p-5 cursor-pointer group"
                onClick={() => handleEditNote(note)}
              >
                <div class="flex items-start justify-between mb-2">
                  <h3 class="font-semibold text-gray-900 truncate flex-1">
                    {note.title}
                  </h3>
                  <Button
                    onClick={(e: Event) => {
                      e.stopPropagation();
                      handleDeleteNote(note.id);
                    }}
                    class="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                    aria-label="Delete note"
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </Button>
                </div>
                <p class="text-sm text-gray-600 line-clamp-3 mb-3">
                  {note.content || "No content"}
                </p>
                <p class="text-xs text-gray-400">
                  {new Date(note.updatedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Note Editor Modal */}
      {isEditorOpen && (
        <NoteEditor
          note={selectedNote}
          onSave={handleSaveNote}
          onCancel={() => {
            setIsEditorOpen(false);
            setSelectedNote(null);
          }}
        />
      )}

      {/* Conflict Resolver Modal */}
      {conflicts.length > 0 && (
        <ConflictResolver
          conflicts={conflicts}
          onResolve={handleConflictResolve}
          onClose={clearConflicts}
        />
      )}
    </div>
  );
}
