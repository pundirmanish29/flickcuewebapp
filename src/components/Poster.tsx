import { useState } from "react";
import { placeholderTint, titleInitials } from "../lib/rules";
import { safeImage } from "../lib/safe";
import { Icon } from "./Icon";

/** A poster, falling back to tinted initials when there's no artwork or it fails to load. */
export function Poster({ src: given, retina: givenRetina, priority = false, person = false, title, className = "" }: {
  src?: string;
  /** A sharper copy for 2x screens, so a small poster doesn't download the big one everywhere. */
  retina?: string;
  /** Above the fold: fetched now rather than when the browser gets round to it. */
  priority?: boolean;
  /** A face, not a film: with no photo (or one that won't load) it is a blank cover with a user icon rather than initials. */
  person?: boolean;
  title: string;
  className?: string;
}) {
  const src = safeImage(given);
  const retina = safeImage(givenRetina);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) {
    if (person) {
      return (
        <div className={`poster poster-placeholder poster-person ${className}`} aria-hidden="true">
          <Icon name="user" size={36} />
        </div>
      );
    }
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
      srcSet={retina ? `${src} 1x, ${retina} 2x` : undefined}
      alt=""
      loading={priority ? "eager" : "lazy"}
      {...(priority ? { fetchPriority: "high" as const } : {})}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}
