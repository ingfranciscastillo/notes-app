import { useState, useEffect, useCallback } from 'preact/hooks';
import { api } from '../config/api';
import {
  getSyncQueue,
  clearSyncQueue,
  getClientId,
  getLastSyncAt,
  setLastSyncAt,
  applyServerChanges,
} from '../config/db';
import type { ConflictData, NoteChange } from '../types';

interface UseSyncReturn {
  isSyncing: boolean;
  lastSyncAt: string | null;
  conflicts: ConflictData[];
  syncNow: () => Promise<void>;
  clearConflicts: () => void;
}

/**
 * Hook for managing sync state and operations
 */
export function useSync(): UseSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAtState] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictData[]>([]);

  /**
   * Load last sync time on mount
   */
  useEffect(() => {
    getLastSyncAt().then((time) => {
      if (time) {
        setLastSyncAtState(time);
      }
    });
  }, []);

  /**
   * Perform synchronization with server
   */
  const syncNow = useCallback(async () => {
    if (isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    // Check if online
    if (!navigator.onLine) {
      console.log('Cannot sync: offline');
      return;
    }

    try {
      setIsSyncing(true);
      console.log('Starting sync...');

      // Get client ID
      const clientId = await getClientId();

      // Get pending changes from sync queue
      const queueItems = await getSyncQueue();

      // Convert queue items to changes array
      const changes: NoteChange[] = queueItems.map((item) => ({
        id: item.data.id,
        title: item.data.title,
        content: item.data.content,
        updatedAt: item.data.updatedAt,
        deleted: item.data.deleted,
        version: item.data.version,
      }));

      // Get last sync timestamp
      const lastSync = await getLastSyncAt();

      // Send sync request to server
      const response = await api.sync({
        clientId,
        lastSyncAt: lastSync,
        changes,
      });

      console.log('Sync response:', response);

      // Apply server changes to local database
      if (response.serverChanges.length > 0) {
        await applyServerChanges(response.serverChanges);
        console.log(
          `Applied ${response.serverChanges.length} server changes`
        );
      }

      // Handle conflicts
      if (response.conflicts.length > 0) {
        console.log(`Found ${response.conflicts.length} conflicts`);
        setConflicts(response.conflicts);
      }

      // Clear sync queue for successfully applied changes
      if (response.applied.length > 0) {
        await clearSyncQueue();
        console.log(`Cleared ${response.applied.length} from sync queue`);
      }

      // Update last sync time
      await setLastSyncAt(response.serverTime);
      setLastSyncAtState(response.serverTime);

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      // Don't clear the sync queue on error - changes will be retried
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  /**
   * Auto-sync when coming back online
   */
  useEffect(() => {
    const handleOnline = () => {
      console.log('Back online, triggering sync...');
      syncNow();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncNow]);

  /**
   * Periodic sync every 30 seconds when online
   */
  useEffect(() => {
    if (!navigator.onLine) return;

    const interval = setInterval(() => {
      if (navigator.onLine && !isSyncing) {
        syncNow();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [syncNow, isSyncing]);

  /**
   * Clear conflicts array
   */
  const clearConflicts = useCallback(() => {
    setConflicts([]);
  }, []);

  return {
    isSyncing,
    lastSyncAt,
    conflicts,
    syncNow,
    clearConflicts,
  };
}