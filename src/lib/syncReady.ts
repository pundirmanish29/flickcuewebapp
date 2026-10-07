/** Metadata must not stamp a cached title newer than edits still waiting in Drive. */
export const visitStartedAt = Date.now();

export interface SyncReadiness {
  connected: boolean;
  lastSyncAt: number;
  status: string;
  held?: number;
}

export function syncReady(sync: SyncReadiness, startedAt = visitStartedAt): boolean {
  return sync.connected && sync.status === "idle" && sync.lastSyncAt >= startedAt && !sync.held;
}
