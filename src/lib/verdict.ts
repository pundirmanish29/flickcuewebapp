// Stars read as one of four plain words, for a short line on a card or the
// bar. The 0-5 stars the list holds (as the extension, Android app and
// Letterboxd use) are what's set and stored; a word is only how they read.

export type Verdict = "skip" | "timepass" | "go" | "perfection";

export const VERDICTS: { id: Verdict; label: string; stars: number }[] = [
  { id: "skip", label: "Skip", stars: 1 },
  { id: "timepass", label: "Timepass", stars: 2.5 },
  { id: "go", label: "Go for it", stars: 4 },
  { id: "perfection", label: "Perfection", stars: 5 }
];

/** The verdict a star rating falls in, or null when unrated. */
export function verdictOf(stars: unknown): Verdict | null {
  const value = Number(stars);
  if (!(value > 0)) return null;
  if (value <= 1.5) return "skip";
  if (value <= 3) return "timepass";
  if (value <= 4) return "go";
  return "perfection";
}

export const verdictLabel = (verdict: Verdict) => VERDICTS.find((item) => item.id === verdict)!.label;
