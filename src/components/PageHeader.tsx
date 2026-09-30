import type { ReactNode } from "react";

/**
 * The top of every signed-in page: its name and, at most, one line worth
 * reading. It stays short so the page's own content starts on the first
 * screen of a phone. The big display lettering belongs to the homepage.
 */
export function PageHeader({ title, meta, className = "" }: { title: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <header className={`page-head ${className}`}>
      <div className="wrap">
        <h1>{title}</h1>
        {meta && <p className="page-meta">{meta}</p>}
      </div>
    </header>
  );
}
