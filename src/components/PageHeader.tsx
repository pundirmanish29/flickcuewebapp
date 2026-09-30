import type { ReactNode } from "react";

/** One big number and what it counts, for the scoreboard under a page's name. */
export type Stat = { value: number | string; label: string; /** Colours the number: orange for something waiting. */ tone?: "orange" };

export function StatRow({ stats, className = "" }: { stats: Stat[]; className?: string }) {
  if (!stats.length) return null;
  return (
    <ul className={`stat-row ${className}`}>
      {stats.map((stat) => (
        <li key={stat.label} className={`stat ${stat.tone ? `tone-${stat.tone}` : ""}`}>
          <b>{stat.value}</b>
          <span>{stat.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The top of every signed-in page: its name in big type and, at most, one line
 * worth reading (or a scoreboard of numbers). It stays short so the page's own
 * content starts on the first screen of a phone.
 */
export function PageHeader({ title, meta, stats, className = "" }: { title: ReactNode; meta?: ReactNode; stats?: Stat[]; className?: string }) {
  return (
    <header className={`page-head ${className}`}>
      <div className="wrap">
        <h1>{title}</h1>
        {meta && <p className="page-meta">{meta}</p>}
        {stats && <StatRow stats={stats} />}
      </div>
    </header>
  );
}
