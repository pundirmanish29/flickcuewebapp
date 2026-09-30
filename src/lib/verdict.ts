// "Your take" as four plain verdicts. They are kept as the same 0-5 stars the
// list has always held (and the extension, Android app and Letterboxd use), so
// nothing else needs to change: a verdict sets its stars, and stars read back
// as the verdict they fall in.

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

/** The stars to save for a tap on a verdict: none when it's already the one held (tapping again clears it). */
export function starsForTap(verdict: Verdict, current: unknown): number {
  return verdictOf(current) === verdict ? 0 : VERDICTS.find((item) => item.id === verdict)!.stars;
}
