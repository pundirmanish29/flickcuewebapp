// Reading a cinema ticket's details out of its text: the text of a PDF e-ticket, or what text recognition found
// in a screenshot or photo. Pure: no network, no clock (`now` is passed in). Whatever this finds is shown to the
// person to check and correct before anything is saved, so it aims to be right often rather than never wrong.

export type TicketSource = "bookmyshow" | "district" | "pvr" | "inox" | "cinepolis" | "other";

export interface TicketDetails {
  /** The show's date, as YYYY-MM-DD in local time. */
  date?: string;
  /** The show's start, as HH:MM (24-hour). */
  time?: string;
  cinema?: string;
  screen?: string;
  seats: string[];
  bookingId?: string;
  source: TicketSource;
}

const DAY = 86_400_000;
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?";
const WEEKDAY = /\b(mon|tue|wed|thu|fri|sat|sun)(day|s|sday|nesday|rsday|urday)?\b/i;
// Lines about when the ticket was bought or paid for, not when the film is on.
const NOT_THE_SHOW = /\b(booked|booking date|bought|purchase|purchased|transaction|paid|payment|issued|generated|printed|order date)\b/i;
const ABOUT_THE_SHOW = /\b(show|showtime|show time|starts?|date|time)\b/i;
const NOISE = /(bookmyshow|book my show|district|zomato|www\.|https?:|\.com|\.in\b|terms|conditions|policy|support|help|cancell?ation|refund|convenience|gst|amount|total|rs\.?|₹|inr)/i;
const CHAINS = /\b(pvr|inox|cin[eé]polis|carnival|miraj|mukta|movietime|movie time|wave|rajhans|cinemax|asian|gold cinema|fun cinemas|big cinemas|sathyam|spi|prasads|ags|mallikarjuna|raj mandir|maxus|city pride|e-?square|inorbit)\b/i;
const VENUE_WORDS = /\b(cinemas?|multiplex|theatre|theater|talkies|cineplex|screens)\b/i;
const SEAT_CLASSES = /^(gold|silver|platinum|recliner|prime|classic|executive|premiere|premium|royal|luxe|standard|balcony|diamond|insignia|imax|4dx|lounger|sofa|normal|regular|elite|club|director'?s cut)\b/i;
const SEAT_TOKEN = /\b([A-Z]{1,2})(?:-| -|- | )?(\d{1,3})\b/g;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** A date with no year is the next one on or after yesterday: tickets are for shows still to come. */
function withYear(m: number, d: number, now: number): [number, number, number] | null {
  const today = new Date(now);
  for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
    if (validDate(y, m, d) && new Date(y, m - 1, d).getTime() >= now - DAY) return [y, m, d];
  }
  return null;
}

function fullYear(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n = Number(text);
  return text.length === 2 ? 2000 + n : n;
}

interface Found { value: string; line: number; score: number }

function findDates(lines: string[], now: number): Found[] {
  const found: Found[] = [];
  const add = (line: number, y: number | undefined, m: number, d: number) => {
    const ymd = y ? (validDate(y, m, d) ? [y, m, d] as const : null) : withYear(m, d, now);
    if (ymd) found.push({ value: iso(ymd[0], ymd[1], ymd[2]), line, score: 0 });
  };
  lines.forEach((text, line) => {
    for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-/.,]*${MONTH}[\\s\\-/.,']*(\\d{4}|'?\\d{2}(?![\\d:.]))?`, "gi"))) {
      add(line, fullYear(match[3]?.replace("'", "")), MONTHS[match[2].toLowerCase()], Number(match[1]));
    }
    for (const match of text.matchAll(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, "gi"))) {
      add(line, fullYear(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
    }
    for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(line, Number(match[1]), Number(match[2]), Number(match[3]));
    // Day first, the way Indian tickets write it.
    for (const match of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) add(line, fullYear(match[3]), Number(match[2]), Number(match[1]));
  });
  return found;
}

function findTimes(lines: string[]): Found[] {
  const found: Found[] = [];
  lines.forEach((raw, line) => {
    // Text recognition often reads a 0 as an O next to digits.
    const text = raw.replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, "0");
    for (const match of text.matchAll(/\b([01]?\d|2[0-3])(:|\.)([0-5]\d)\s*([ap])\.?\s*m\.?(?![a-z])/gi)) {
      let hour = Number(match[1]) % 12;
      if (match[4].toLowerCase() === "p") hour += 12;
      found.push({ value: `${pad(hour)}:${match[3]}`, line, score: 1 });
    }
    // A bare 24-hour time only with a colon, so prices like 12.50 aren't read as times.
    for (const match of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*[ap]\.?\s*m)/gi)) {
      found.push({ value: `${pad(Number(match[1]))}:${match[2]}`, line, score: 0 });
    }
  });
  return found;
}

function best(found: Found[]): Found | undefined {
  return [...found].sort((a, b) => b.score - a.score || a.line - b.line)[0];
}

function pickDateAndTime(lines: string[], now: number): { date?: string; time?: string } {
  const dates = findDates(lines, now);
  const times = findTimes(lines);
  for (const date of dates) {
    const text = lines[date.line];
    if (times.some((time) => time.line === date.line)) date.score += 3;
    else if (times.some((time) => Math.abs(time.line - date.line) === 1)) date.score += 2;
    if (WEEKDAY.test(text)) date.score += 2;
    if (ABOUT_THE_SHOW.test(text)) date.score += 1;
    if (NOT_THE_SHOW.test(text)) date.score -= 4;
    if (new Date(`${date.value}T00:00`).getTime() >= now - DAY) date.score += 1;
  }
  const date = best(dates);
  for (const time of times) {
    const text = lines[time.line];
    if (date && time.line === date.line) time.score += 3;
    else if (date && Math.abs(time.line - date.line) === 1) time.score += 2;
    if (ABOUT_THE_SHOW.test(text)) time.score += 1;
    if (NOT_THE_SHOW.test(text)) time.score -= 4;
  }
  const time = best(times);
  return { date: date && date.score > -2 ? date.value : undefined, time: time && time.score > -2 ? time.value : undefined };
}

function seatTokens(text: string): string[] {
  return [...text.matchAll(SEAT_TOKEN)].map((match) => `${match[1]}${Number(match[2])}`);
}

function pickSeats(lines: string[]): string[] {
  const seats: string[] = [];
  lines.forEach((text, line) => {
    // "Row H Seats 5, 6"
    const row = /\brow\s*[:\-]?\s*([A-Z]{1,2})\b[,\s]*seats?\s*(?:no\.?)?\s*[:\-]?\s*((?:\d{1,3}\s*(?:,|&|and|\s)\s*)*\d{1,3})/i.exec(text);
    if (row) {
      for (const n of row[2].match(/\d{1,3}/g) ?? []) seats.push(`${row[1].toUpperCase()}${Number(n)}`);
      return;
    }
    const labelled = /\bseats?\b|\bseat\(s\)/i.test(text);
    const afterLabel = labelled ? text.replace(/^.*?\bseat(?:s|\(s\))?\b\s*(?:no\.?|nos\.?|numbers?)?\s*[:\-]?/i, "") : text;
    let tokens = seatTokens(afterLabel.toUpperCase() === afterLabel ? afterLabel : afterLabel.replace(/\b([a-z]{1,2})(?=-?\s?\d)/g, (s) => s.toUpperCase()));
    if (labelled && !tokens.length && lines[line + 1]) tokens = seatTokens(lines[line + 1]);
    const covered = tokens.join("").length;
    const solid = text.replace(/[\s,;|&-]/g, "").length;
    const looksLikeSeats = labelled || SEAT_CLASSES.test(text.trim()) || (tokens.length > 0 && covered / Math.max(solid, 1) >= 0.6);
    if (looksLikeSeats && !NOISE.test(text)) seats.push(...tokens);
  });
  return [...new Set(seats)].slice(0, 20);
}

function pickScreen(lines: string[]): string | undefined {
  for (const text of lines) {
    const match = /\b(screen|audi(?:torium)?|hall)\b\s*(?:no\.?)?\s*[:#\-]?\s*([0-9]{1,2}|[A-Z0-9]{2,8})\b/i.exec(text);
    if (!match || NOISE.test(text)) continue;
    const label = match[1].toLowerCase().startsWith("audi") ? "Audi" : match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    const value = /^\d+$/.test(match[2]) ? String(Number(match[2])) : match[2].toUpperCase();
    return `${label} ${value}`;
  }
  return undefined;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").replace(/^[\s:,\-|•·]+|[\s:,\-|•·]+$/g, "").slice(0, 80);
}

function pickCinema(lines: string[]): string | undefined {
  for (const text of lines) {
    const labelled = /\b(?:cinema|venue|theatre|theater|location)\s*[:\-]\s*(.+)$/i.exec(text);
    if (labelled && labelled[1].trim().length > 2) return tidy(labelled[1]);
  }
  const candidates = lines.filter((text) => (CHAINS.test(text) || VENUE_WORDS.test(text)) && !NOISE.test(text) && !/^\s*(e-?ticket|ticket)\s*$/i.test(text));
  // A chain's name with a place after it ("PVR: Select Citywalk, Saket") beats a bare brand header ("PVR INOX").
  const scored = candidates.map((text, index) => ({
    text,
    score: (CHAINS.test(text) ? 2 : 0) + (/[,:]/.test(text) ? 2 : 0) + (text.trim().split(/\s+/).length >= 3 ? 1 : 0) - index * 0.01
  }));
  const top = scored.sort((a, b) => b.score - a.score)[0];
  return top && top.score >= 2 ? tidy(top.text.replace(/\b(screen|audi(?:torium)?|hall)\b.*$/i, "")) : undefined;
}

function pickBookingId(lines: string[]): string | undefined {
  const label = /\b(booking|order|confirmation|transaction|ticket|reference)\s*(?:id|no\.?|number|ref(?:erence)?|code)?\b\s*[:#.\-]?\s*/i;
  const ranked = ["booking", "confirmation", "order", "ticket", "reference", "transaction"];
  const found: { id: string; rank: number }[] = [];
  lines.forEach((text, line) => {
    const match = label.exec(text);
    if (!match) return;
    const rest = text.slice(match.index + match[0].length);
    const id = /^([A-Z0-9][A-Z0-9-]{4,24})\b/i.exec(rest.trim())?.[1] ?? (rest.trim() === "" ? /^\s*([A-Z0-9][A-Z0-9-]{4,24})\s*$/i.exec(lines[line + 1] ?? "")?.[1] : undefined);
    // An id has a digit in it, which keeps words like "Confirmed" out.
    if (id && /\d/.test(id)) found.push({ id: id.toUpperCase(), rank: ranked.indexOf(match[1].toLowerCase()) });
  });
  return found.sort((a, b) => a.rank - b.rank)[0]?.id;
}

function pickSource(text: string): TicketSource {
  if (/book\s?my\s?show/i.test(text)) return "bookmyshow";
  if (/\bdistrict\b|zomato/i.test(text)) return "district";
  if (/\bpvr\b/i.test(text)) return "pvr";
  if (/\binox\b/i.test(text)) return "inox";
  if (/cin[eé]polis/i.test(text)) return "cinepolis";
  return "other";
}

export function parseTicket(text: string, now: number): TicketDetails {
  const lines = String(text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
  const { date, time } = pickDateAndTime(lines, now);
  return {
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
    ...(pickCinema(lines) ? { cinema: pickCinema(lines) } : {}),
    ...(pickScreen(lines) ? { screen: pickScreen(lines) } : {}),
    seats: pickSeats(lines),
    ...(pickBookingId(lines) ? { bookingId: pickBookingId(lines) } : {}),
    source: pickSource(text)
  };
}

/** The show's start as a timestamp, in this device's time zone; null without both a date and a time. */
export function showTimeOf(date: string | undefined, time: string | undefined): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const t = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (!d || !t) return null;
  const at = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])).getTime();
  return Number.isFinite(at) ? at : null;
}
