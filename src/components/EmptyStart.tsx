import type { ReactNode } from "react";

/** A page with nothing on it yet: what it's for in one line, and the ways to fill it. */
export function EmptyStart({ lead, text, children, footnote }: { lead: string; text: string; children: ReactNode; footnote?: ReactNode }) {
  return (
    <div className="empty-start">
      <p className="empty-start-lead"><em>{lead}</em> {text}</p>
      <div className="button-row">{children}</div>
      {footnote && <p className="empty-start-note">{footnote}</p>}
    </div>
  );
}
