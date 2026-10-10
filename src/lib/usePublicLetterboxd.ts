import { useEffect, useRef, useState } from "react";
import { commit, getSessionGeneration, getState } from "./store";
import { fetchPublicProfile, mergePublicEntries, resolvePublicEntry, type PublicProfile, type PublicImportRecord, type ResolvedEntry } from "./letterboxdPublic";
import { letterboxdAvatar } from "./letterboxdConnection";
import { findExisting } from "./editor";

const activeImports = new Set<string>();
export function importStorageKey(email: string, username: string) { return `flickcue.letterboxdPublic.v1:${email.toLowerCase()}:${username}`; }
function readRecord(key: string): PublicImportRecord | null {
  try { const record = JSON.parse(localStorage.getItem(key) || "null"); return record && record.imported && typeof record.syncedAt === "number" ? record : null; } catch { return null; }
}

export function usePublicLetterboxd(email: string, username: string) {
  const key = importStorageKey(email, username);
  const [state, setState] = useState<{ key: string; profile?: PublicProfile; record?: PublicImportRecord | null; error?: string }>({ key });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ key: string; done: number; total: number } | null>(null);
  const [check, setCheck] = useState(0);
  const currentKey = useRef(key); currentKey.current = key;
  const operation = useRef(0);
  useEffect(() => {
    if (!username) return;
    let live = true;
    setProgress(null); setLoading(true); setState({ key, record: readRecord(key) });
    void fetchPublicProfile(username).then(profile => {
      if (live) setState(value => ({ ...value, key, profile: { ...profile, avatarUrl: letterboxdAvatar(profile.avatarUrl) }, error: "" }));
    }).catch(error => { if (live) setState(value => ({ ...value, key, error: error.message })); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; operation.current++; };
  }, [key, username, check]);

  const startImport = async () => {
    if (activeImports.has(key)) return;
    activeImports.add(key);
    const operationId = ++operation.current;
    const generation = getSessionGeneration();
    const baseline = getState().library;
    const previous = readRecord(key);
    const imported = { ...previous?.imported };
    const current = () => operationId === operation.current && generation === getSessionGeneration() && getState().settings.letterboxd === username
      && (getState().sync.account?.email || "").toLowerCase() === email.toLowerCase();
    setProgress({ key, done: 0, total: 0 });
    setState(value => ({ ...value, error: "" }));
    try {
      const profile = await fetchPublicProfile(username);
      if (!current()) throw new Error("Import stopped because the account or profile changed.");
      const resolved: ResolvedEntry[] = [];
      let index = 0; let done = 0;
      const worker = async () => {
        while (index < profile.entries.length && current()) {
          const entry = profile.entries[index++];
          // Existing matches don't depend on title services being online.
          const existing = baseline.movies.find(movie => (movie.letterboxd as { slug?: string } | undefined)?.slug === entry.slug
            || (entry.tmdbId && movie.tmdbId === entry.tmdbId && movie.tmdbType === entry.tmdbType));
          const candidate = existing ? null : await resolvePublicEntry(entry).catch(() => null);
          const original = existing || (candidate ? findExisting(baseline, candidate) : undefined);
          if (original) imported[entry.slug] = original.id;
          resolved.push({ entry, candidate }); done++;
          if (currentKey.current === key) setProgress({ key, done, total: profile.entries.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (!current()) throw new Error("Import stopped because the account or profile changed.");
      // Merge only after all requests, against the latest edits and removals.
      const result = mergePublicEntries(getState().library, resolved, { syncedAt: 0, added: 0, updated: 0, skipped: 0, warnings: [], ...previous, imported });
      result.record.warnings = [...profile.warnings];
      if (result.record.skipped) result.record.warnings.push(`${result.record.skipped} films were skipped because they were removed or couldn't be matched safely.`);
      // Storage must work before committing; otherwise a retry could undo a deletion.
      localStorage.setItem(key, JSON.stringify(result.record));
      if (result.document !== getState().library) commit(result.document);
      if (currentKey.current === key) setState({ key, profile: { ...profile, avatarUrl: letterboxdAvatar(profile.avatarUrl) }, record: result.record, error: "" });
    } catch (error) {
      if (currentKey.current === key) setState(value => ({ ...value, error: error instanceof Error ? error.message : "Couldn't import this profile. Try again later." }));
    } finally { activeImports.delete(key); if (currentKey.current === key) setProgress(null); }
  };
  const visible = state.key === key ? state : { key };
  return { ...visible, loading, progress: progress?.key === key ? progress : null, startImport, refresh: () => setCheck(value => value + 1) };
}
