import { useEffect, useState } from "react";
import { CandidateCard } from "../components/CandidateCard";
import { Icon } from "../components/Icon";
import { ReminderChoices } from "../components/ReminderMenu";
import * as actions from "../lib/actions";
import { browse, DISCOVER_CATEGORIES, searchTitles } from "../lib/tmdb";
import type { Candidate } from "../lib/types";

type Load = { state: "loading" } | { state: "done"; items: Candidate[] } | { state: "error"; message: string };

function AddByHand({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [mediaType, setMediaType] = useState("Movie");
  const [step, setStep] = useState<"form" | "remind">("form");

  const save = (remind: number | null) => {
    if (actions.addManual(title, year, mediaType, remind)) onDone();
  };

  return (
    <div className="manual">
      {step === "form" ? (
        <form
          className="manual-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) setStep("remind");
          }}
        >
          <label>
            <span className="eyebrow">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required autoFocus />
          </label>
          <label className="manual-year">
            <span className="eyebrow">Year</span>
            <input value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="Optional" />
          </label>
          <label>
            <span className="eyebrow">Type</span>
            <select value={mediaType} onChange={(event) => setMediaType(event.target.value)}>
              <option>Movie</option>
              <option>Show</option>
              <option>Documentary</option>
            </select>
          </label>
          <button type="submit" className="button button-ink">Next</button>
        </form>
      ) : (
        <div>
          <p className="popover-label">Remind me about {title.trim()}…</p>
          <ReminderChoices onPick={save} onNone={() => save(null)} noneLabel="Just save it" />
        </div>
      )}
    </div>
  );
}

export function DiscoverPage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const [category, setCategory] = useState(DISCOVER_CATEGORIES[0].id);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [manual, setManual] = useState(false);
  const searching = query.trim().length >= 2;

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    const timer = setTimeout(() => {
      const request = searching
        ? searchTitles(query.trim())
        : browse(DISCOVER_CATEGORIES.find((item) => item.id === category) ?? DISCOVER_CATEGORIES[0]);
      request
        .then((items) => live && setLoad({ state: "done", items }))
        .catch((error) => live && setLoad({ state: "error", message: error.message }));
    }, searching ? 350 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [category, query, searching]);

  const heading = searching ? `Results for “${query.trim()}”` : DISCOVER_CATEGORIES.find((item) => item.id === category)?.label;

  return (
    <>
      <section className="intro paper compact">
        <div className="wrap">
          <p className="eyebrow">Discover</p>
          <h1 className="display">
            Find the next one.
            <em>Save it for later.</em>
          </h1>
          <p className="lede">Search with the box at the top, or browse what's trending and what's coming soon.</p>
        </div>
      </section>

      <section className="paper titles">
        <div className="wrap">
          {!searching && (
            <div className="category-row" role="tablist" aria-label="Lists">
              {DISCOVER_CATEGORIES.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className="category" onClick={() => setCategory(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="toolbar">
            <h2 className="section-title">{heading}</h2>
            <button type="button" className="button button-quiet small" aria-expanded={manual} onClick={() => setManual((open) => !open)}>
              <Icon name="plus" size={15} /> Add by hand
            </button>
          </div>
          {manual && <AddByHand onDone={() => setManual(false)} />}

          {load.state === "loading" && (
            <div className="grid" aria-busy="true">
              {Array.from({ length: 12 }, (_, index) => <div key={index} className="skeleton-card" />)}
            </div>
          )}
          {load.state === "error" && <p className="empty">{load.message}</p>}
          {load.state === "done" && (load.items.length ? (
            <div className="grid">
              {load.items.map((item) => <CandidateCard key={item.key} candidate={item} onOpenSaved={onOpen} />)}
            </div>
          ) : (
            <p className="empty">Nothing found. Try another spelling, or add it by hand.</p>
          ))}
        </div>
      </section>
    </>
  );
}
