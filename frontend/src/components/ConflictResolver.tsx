import { useState } from "preact/hooks";
import type { ConflictData } from "../types";
import { updateNoteLocally } from "../config/db";

interface ConflictResolverProps {
  conflicts: ConflictData[];
  onResolve: () => void;
  onClose: () => void;
}

export function ConflictResolver({
  conflicts,
  onResolve,
  onClose,
}: ConflictResolverProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [isManualMode, setIsManualMode] = useState(false);

  if (conflicts.length === 0) return null;

  const current = conflicts[currentIndex];

  const handleResolve = async (choice: "server" | "client" | "manual") => {
    if (choice === "server") {
      // Keep server version - update local
      await updateNoteLocally(
        current.server.id,
        current.server.title,
        current.server.content
      );
    } else if (choice === "client") {
      // Keep client version - already in local DB
      // Just need to trigger sync again
    } else if (choice === "manual") {
      // Apply manual resolution
      await updateNoteLocally(current.server.id, manualTitle, manualContent);
    }

    // Move to next conflict or finish
    if (currentIndex < conflicts.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsManualMode(false);
    } else {
      onResolve();
    }
  };

  const startManualResolve = () => {
    setManualTitle(current.client.title);
    setManualContent(current.client.content);
    setIsManualMode(true);
  };

  return (
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div class="px-6 py-4 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900">
              Resolve Conflicts ({currentIndex + 1}/{conflicts.length})
            </h2>
            <button
              onClick={onClose}
              class="text-gray-400 hover:text-gray-600 transition"
              aria-label="Close"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p class="text-sm text-gray-600 mt-2">
            This note has conflicting changes. Choose which version to keep.
          </p>
        </div>

        {/* Content */}
        {!isManualMode ? (
          <div class="flex-1 overflow-y-auto p-6">
            <div class="grid grid-cols-2 gap-6">
              {/* Server Version */}
              <div class="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-blue-900">Server Version</h3>
                  <span class="text-xs text-blue-600">
                    {new Date(current.server.updatedAt).toLocaleString()}
                  </span>
                </div>
                <div class="space-y-3">
                  <div>
                    <p class="text-xs text-blue-700 mb-1">Title:</p>
                    <p class="font-medium text-gray-900">
                      {current.server.title}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-blue-700 mb-1">Content:</p>
                    <p class="text-sm text-gray-700 whitespace-pre-wrap">
                      {current.server.content}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleResolve("server")}
                  class="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Keep Server Version
                </button>
              </div>

              {/* Client Version */}
              <div class="border border-green-200 rounded-lg p-4 bg-green-50">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-green-900">Your Version</h3>
                  <span class="text-xs text-green-600">
                    {new Date(current.client.updatedAt).toLocaleString()}
                  </span>
                </div>
                <div class="space-y-3">
                  <div>
                    <p class="text-xs text-green-700 mb-1">Title:</p>
                    <p class="font-medium text-gray-900">
                      {current.client.title}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-green-700 mb-1">Content:</p>
                    <p class="text-sm text-gray-700 whitespace-pre-wrap">
                      {current.client.content}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleResolve("client")}
                  class="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Keep Your Version
                </button>
              </div>
            </div>

            {/* Manual Merge Option */}
            <div class="mt-6 text-center">
              <button
                onClick={startManualResolve}
                class="px-6 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition"
              >
                Manually Merge Changes
              </button>
            </div>
          </div>
        ) : (
          <div class="flex-1 overflow-y-auto p-6">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={manualTitle}
                  onInput={(e) =>
                    setManualTitle((e.target as HTMLInputElement).value)
                  }
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Content
                </label>
                <textarea
                  value={manualContent}
                  onInput={(e) =>
                    setManualContent((e.target as HTMLTextAreaElement).value)
                  }
                  rows={12}
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {isManualMode && (
          <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => setIsManualMode(false)}
              class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Back
            </button>
            <button
              onClick={() => handleResolve("manual")}
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Apply Manual Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
