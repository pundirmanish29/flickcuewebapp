// The shape of a saved title in `flickcue-watchlist.json`, the Drive file the
// extension and the Android app already share. Only the fields the web app
// reads are typed; everything else rides along untouched (the index
// signature), because a client that drops fields it doesn't know would erase
// them from the other two on the next sync.

export interface Season {
  number: number;
  name?: string;
  year?: string;
  episodes: number;
  rating?: string | null;
  poster?: string;
}

export interface ShowSchedule {
  firstAirDate?: string;
  status?: string;
  seasons?: number;
  next?: { date: string; season: number; episode: number; finale?: boolean } | null;
  last?: { date: string; season: number; episode: number; finale?: boolean } | null;
}

export interface Personal {
  status?: string;
  note?: string;
  episodes?: string[];
  interested?: boolean;
  [key: string]: unknown;
}

export interface Movie {
  id: string;
  title: string;
  year?: string;
  mediaType?: string;
  tmdbType?: string;
  tmdbId?: string;
  watched?: boolean;
  watchedAt?: number;
  remindAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  releaseDate?: string;
  upcoming?: boolean;
  poster?: string;
  backdrop?: string;
  tagline?: string;
  rating?: string;
  runtimeMinutes?: number;
  genres?: string[];
  seasons?: Season[];
  showSchedule?: ShowSchedule;
  origin?: string;
  criticScore?: number;
  audienceScore?: number;
  imdbRating?: number;
  personal?: Personal;
  sourceUrl?: string;
  [key: string]: unknown;
}

export interface Tombstone {
  id: string;
  deletedAt: number;
}

export interface LibraryDocument {
  movies: Movie[];
  deleted: Tombstone[];
}

/** A TMDB search or Discover result, before it is saved. */
export interface Candidate {
  key: string;
  title: string;
  year: string;
  mediaType: string;
  tmdbType: "movie" | "tv";
  tmdbId: string;
  releaseDate: string;
  overview: string;
  rating: string;
  poster: string;
  backdrop: string;
  upcoming: boolean;
}

export type SortMode = "added" | "reminder" | "title" | "rating" | "shortest";
export type KindFilter = "all" | "movie" | "tv";
