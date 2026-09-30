import { verdictOf, VERDICTS, starsForTap, type Verdict } from "../lib/verdict";

/**
 * Skip, Timepass, Go for it or Perfection: one tap for how it was, kept as the same stars underneath.
 * `stars` lights the pill (yours, else Letterboxd's); `ownStars` is what you saved, so tapping a
 * verdict that only came from Letterboxd makes it yours instead of trying to clear it.
 */
export function VerdictScale({ stars, ownStars, onPick }: { stars: number; ownStars: number; onPick: (stars: number) => void }) {
  const current = verdictOf(stars);
  return (
    <div className="verdict-scale" role="group" aria-label="Your verdict">
      {VERDICTS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`verdict verdict-${item.id} ${current === item.id ? "on" : ""}`}
          aria-pressed={current === item.id}
          onClick={() => onPick(starsForTap(item.id as Verdict, ownStars))}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
