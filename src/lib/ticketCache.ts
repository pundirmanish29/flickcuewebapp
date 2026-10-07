// A copy of each ticket file on this device (IndexedDB), so it opens at the cinema even with no signal. Drive
// keeps the lasting copy; this one is a convenience, cleared when someone signs out on this device.

const DB_NAME = "flickcue-tickets";
const STORE = "files";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => {
        db.close();
        resolve(request ? (request.result as T) ?? null : null);
      };
      transaction.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** Keeps a ticket file on this device, under its title's id. */
export async function cacheTicket(movieId: string, file: Blob): Promise<void> {
  await run("readwrite", (store) => store.put(file, movieId));
}

export async function cachedTicket(movieId: string): Promise<Blob | null> {
  const value = await run<unknown>("readonly", (store) => store.get(movieId));
  return value instanceof Blob ? value : null;
}

export async function forgetTicket(movieId: string): Promise<void> {
  await run("readwrite", (store) => store.delete(movieId));
}

export async function forgetAllTickets(): Promise<void> {
  await run("readwrite", (store) => store.clear());
}
