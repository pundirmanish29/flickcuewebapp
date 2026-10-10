export function handlePublicProfile(username: string): Promise<Response>;
export function parseFeed(xml: string, username: string): { entries: import('../src/lib/letterboxdPublic').PublicEntry[]; displayName: string };
export function parseWatchlist(html: string): { entries: import('../src/lib/letterboxdPublic').PublicEntry[]; next: boolean; avatarUrl: string; displayName: string };
export function publicProfile(username: string, fetchImpl?: typeof fetch): Promise<import('../src/lib/letterboxdPublic').PublicProfile>;
