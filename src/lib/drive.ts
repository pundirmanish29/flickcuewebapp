// The Drive side of sync, byte-compatible with drive-sync.js: one JSON file,
// `flickcue-watchlist.json`, in the hidden appDataFolder.

import type { LibraryDocument } from "./types";

const DRIVE_FILE_NAME = "flickcue-watchlist.json";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export class DriveError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function driveFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new DriveError(`Drive request failed (${response.status}). ${detail.slice(0, 200)}`, response.status);
  }
  return response;
}

export async function findRemoteFileId(token: string, name = DRIVE_FILE_NAME): Promise<string> {
  const url = new URL(DRIVE_FILES_URL);
  url.search = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${name}' and trashed = false`,
    fields: "files(id,modifiedTime)",
    pageSize: "10"
  }).toString();
  const data = await (await driveFetch(url.toString(), token)).json();
  return data.files?.[0]?.id ?? "";
}

export async function readRemote(fileId: string, token: string): Promise<LibraryDocument> {
  return parseDocument(await (await driveFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, token)).json().catch(() => null));
}

/** Drive's version number for the file: it goes up with every save, from any device. */
export async function fileVersion(fileId: string, token: string): Promise<string> {
  const data = await (await driveFetch(`${DRIVE_FILES_URL}/${fileId}?fields=version`, token)).json();
  return String(data.version ?? "");
}

export interface Revision {
  id: string;
  modifiedTime: string;
}

/** The list's earlier saves that Drive keeps (about 30 days' worth), newest first. */
export async function listRevisions(fileId: string, token: string): Promise<Revision[]> {
  const data = await (await driveFetch(`${DRIVE_FILES_URL}/${fileId}/revisions?fields=revisions(id,modifiedTime)&pageSize=200`, token)).json();
  return (Array.isArray(data.revisions) ? data.revisions : [])
    .filter((revision: unknown) => isRecord(revision) && typeof revision.id === "string")
    .map((revision: Record<string, unknown>) => ({ id: String(revision.id), modifiedTime: String(revision.modifiedTime ?? "") }))
    .reverse();
}

export async function readRevision(fileId: string, revisionId: string, token: string): Promise<LibraryDocument> {
  const response = await driveFetch(`${DRIVE_FILES_URL}/${fileId}/revisions/${encodeURIComponent(revisionId)}?alt=media`, token);
  return parseDocument(await response.json().catch(() => null));
}

function parseDocument(data: any): LibraryDocument {
  if (!data || typeof data !== "object") return { movies: [], deleted: [] };
  return {
    // Only entries shaped like titles and tombstones; the rest of each is kept as it is (SHARED.md's golden rule).
    movies: Array.isArray(data.movies) ? data.movies.filter((movie: unknown) => isRecord(movie) && typeof movie.id === "string" && typeof movie.title === "string") : [],
    deleted: Array.isArray(data.deleted) ? data.deleted.filter((entry: unknown) => isRecord(entry) && typeof entry.id === "string") : []
  };
}

export async function writeRemote(fileId: string, token: string, document: LibraryDocument): Promise<string> {
  const body = JSON.stringify({ version: 1, updatedAt: Date.now(), movies: document.movies, deleted: document.deleted });
  return writeFile(fileId, token, DRIVE_FILE_NAME, body);
}

// The web app's settings live in a file of their own beside the list: the
// other clients rewrite the list file with only the fields they know, so
// anything added there would be lost at their next sync.
const SETTINGS_FILE_NAME = "flickcue-settings.json";

export const findSettingsFileId = (token: string) => findRemoteFileId(token, SETTINGS_FILE_NAME);

export async function readRemoteSettings(fileId: string, token: string): Promise<{ updatedAt: number; settings: Record<string, unknown> } | null> {
  const response = await driveFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, token);
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || typeof data.settings !== "object" || !data.settings) return null;
  return { updatedAt: Number(data.updatedAt) || 0, settings: data.settings };
}

export function writeRemoteSettings(fileId: string, token: string, updatedAt: number, settings: Record<string, unknown>): Promise<string> {
  return writeFile(fileId, token, SETTINGS_FILE_NAME, JSON.stringify({ version: 1, updatedAt, settings }));
}

async function writeFile(fileId: string, token: string, name: string, body: string): Promise<string> {
  if (fileId) {
    await driveFetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body
    });
    return fileId;
  }

  const boundary = `flickcue${Date.now()}`;
  const metadata = JSON.stringify({ name, parents: ["appDataFolder"] });
  const multipart = [
    `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", metadata,
    `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", body,
    `--${boundary}--`, ""
  ].join("\r\n");

  const response = await driveFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart
  });
  return (await response.json()).id;
}

export interface Account {
  email: string;
  name: string;
  photo: string;
}

/** Drive's about.user carries the name and photo under the same drive.appdata scope. */
export async function fetchAccount(token: string): Promise<Account | null> {
  try {
    const response = await driveFetch(`${DRIVE_ABOUT_URL}?fields=user(emailAddress,displayName,photoLink)`, token);
    const user = (await response.json()).user ?? {};
    const photo = String(user.photoLink ?? "");
    return {
      email: String(user.emailAddress ?? ""),
      name: String(user.displayName ?? "").trim().slice(0, 80),
      photo: /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//i.test(photo) ? photo.replace(/=s\d+(-[a-z]+)?$/i, "=s96-c") : ""
    };
  } catch {
    return null;
  }
}
