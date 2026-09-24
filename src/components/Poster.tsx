import { useState } from "react";
import { placeholderTint, titleInitials } from "../lib/rules";

/** A poster, falling back to tinted initials when there's no artwork or it fails to load. */
export function Poster({ src, title, className = "" }: { src?: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`poster poster-placeholder ${className}`} style={{ ["--tint" as string]: placeholderTint(title) }} aria-hidden="true">
        <span>{titleInitials(title)}</span>
      </div>
    );
  }
  return <img className={`poster ${className}`} src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
