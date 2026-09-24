// The Drive side of sync, byte-compatible with drive-sync.js: one JSON file,
// `flickcue-watchlist.json`, in the hidden appDataFolder.

import type { LibraryDocument } from "./types";

const DRIVE_FILE_NAME = "flickcue-watchlist.json";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

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

export async function findRemoteFileId(token: string): Promise<string> {
  const url = new URL(DRIVE_FILES_URL);
  url.search = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${DRIVE_FILE_NAME}' and trashed = false`,
    fields: "files(id,modifiedTime)",
    pageSize: "10"
  }).toString();
  const data = await (await driveFetch(url.toString(), token)).json();
  return data.files?.[0]?.id ?? "";
}

export async function readRemote(fileId: string, token: string): Promise<LibraryDocument> {
  const response = await driveFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, token);
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") return { movies: [], deleted: [] };
  return {
    movies: Array.isArray(data.movies) ? data.movies : [],
    deleted: Array.isArray(data.deleted) ? data.deleted : []
  };
}

export async function writeRemote(fileId: string, token: string, document: LibraryDocument): Promise<string> {
  const body = JSON.stringify({ version: 1, updatedAt: Date.now(), movies: document.movies, deleted: document.deleted });

  if (fileId) {
    await driveFetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body
    });
    return fileId;
  }

  const boundary = `flickcue${Date.now()}`;
  const metadata = JSON.stringify({ name: DRIVE_FILE_NAME, parents: ["appDataFolder"] });
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
