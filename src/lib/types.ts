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

/** How the Android app records a show's next or last episode (SHARED.md, "Known gaps" 1). */
export interface EpisodeAir {
  season: number;
  episode: number;
  airDate: string;
  name?: string;
}

export interface Personal {
  status?: string;
  note?: string;
  episodes?: string[];
  interested?: boolean;
  [key: string]: unknown;
}

/** A cinema ticket the person added: read on their device, kept in their own Drive. Only the web app sets it so far. */
export interface Booking {
  /** When the show starts. */
  showAt: number;
  cinema?: string;
  screen?: string;
  seats?: string[];
  bookingId?: string;
  /** Where it was booked: "bookmyshow", "district", "pvr", "inox", "cinepolis" or "other". */
  source?: string;
  /** The ticket file in FlickCue's private Drive folder, to show at the cinema. */
  ticketFileId?: string;
  ticketFileName?: string;
  ticketMime?: string;
  addedAt: number;
  /** "Did you watch it?" was answered "Not yet", so it isn't asked again. */
  watchedAsked?: boolean;
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
  productionStatus?: string;
  nextEpisode?: EpisodeAir;
  lastEpisode?: EpisodeAir;
  origin?: string;
  criticScore?: number;
  audienceScore?: number;
  imdbRating?: number;
  personal?: Personal;
  sourceUrl?: string;
  booking?: Booking;
  /** When its TMDB details were last fetched (ms). Shared with the extension; refreshed within TMDB's six-month limit (lib/metaRefresh.ts). */
  metaFetchedAt?: number;
  /** A poster picked by hand, never replaced by a refresh (the extension sets it). */
  posterLocked?: boolean;
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
  /** Why it was suggested, e.g. "Because you saved Arrival". */
  reason?: string;
  /** Its main genre, short: "Thriller", "Sci-Fi". */
  genre?: string;
}

export type SortMode = "added" | "reminder" | "title" | "rating" | "shortest";
export type KindFilter = "all" | "movie" | "tv";
