import { useState } from "react";
import { placeholderTint, titleInitials } from "../lib/rules";
import { safeImage } from "../lib/safe";

/** A poster, falling back to tinted initials when there's no artwork or it fails to load. */
export function Poster({ src: given, title, className = "" }: { src?: string; title: string; className?: string }) {
  const src = safeImage(given);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) {
    return (
      <div className={`poster poster-placeholder ${className}`} style={{ ["--tint" as string]: placeholderTint(title) }} aria-hidden="true">
        <span>{titleInitials(title)}</span>
      </div>
    );
  }
  // Until it arrives, the frame shimmers (styles.css) rather than sitting as a blank box.
  return (
    <img
      className={`poster ${className} ${loaded ? "" : "is-loading"}`}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}
