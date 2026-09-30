import { formatRating } from "../lib/rules";
import { scoreOf } from "../lib/score";
import { Icon } from "./Icon";

/** A rating as a star and number, coloured by how well liked it is; the word is in its label. */
export function RatingScore({ value, className = "meta-rating", size = 11 }: { value: unknown; className?: string; size?: number }) {
  const text = formatRating(value);
  const score = scoreOf(value);
  if (!text || !score) return null;
  return (
    <span className={`${className} tier-${score.tier}`} title={`${text} · ${score.word}`} aria-label={`Rating ${text} out of 10, ${score.word}`}>
      <Icon name="star" size={size} /> {text}
    </span>
  );
}
