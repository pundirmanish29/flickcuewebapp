// A rating on TMDB's ten-point scale, in four bands, so a score reads at a
// glance: colour on the card, the word in its label.

export type ScoreTier = "great" | "good" | "mixed" | "poor";

export interface Score {
  tier: ScoreTier;
  word: string;
}

export function scoreOf(value: unknown): Score | null {
  const score = Number(value);
  if (!(score > 0)) return null;
  if (score >= 8) return { tier: "great", word: "Loved" };
  if (score >= 7) return { tier: "good", word: "Well liked" };
  if (score >= 5.5) return { tier: "mixed", word: "Mixed" };
  return { tier: "poor", word: "Weak" };
}
