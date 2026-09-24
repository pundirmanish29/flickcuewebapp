import { useEffect, useRef, useState } from "react";
import { releaseDayReminder, tomorrowReminder, tonightReminder, weekendReminder } from "../lib/rules";

function toInputValue(time: number) {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The reminder choices the extension offers when saving: tonight, tomorrow,
 * the weekend, release day for something not out yet, or an exact time.
 */
export function ReminderChoices({
  releaseDate,
  onPick,
  noneLabel,
  onNone
}: {
  releaseDate?: string;
  onPick: (at: number) => void;
  noneLabel?: string;
  onNone?: () => void;
}) {
  const releaseDay = releaseDayReminder(releaseDate);
  const [custom, setCustom] = useState(() => toInputValue(tomorrowReminder()));

  return (
    <div className="reminder-choices">
      {releaseDay ? (
        <button type="button" className="chip-button" onClick={() => onPick(releaseDay)}>On release day</button>
      ) : (
        <>
          <button type="button" className="chip-button" onClick={() => onPick(tonightReminder())}>Tonight</button>
          <button type="button" className="chip-button" onClick={() => onPick(tomorrowReminder())}>Tomorrow</button>
          <button type="button" className="chip-button" onClick={() => onPick(weekendReminder())}>This weekend</button>
        </>
      )}
      <form
        className="reminder-custom"
        onSubmit={(event) => {
          event.preventDefault();
          const at = new Date(custom).getTime();
          if (Number.isFinite(at)) onPick(at);
        }}
      >
        <input type="datetime-local" value={custom} min={toInputValue(Date.now())} onChange={(event) => setCustom(event.target.value)} aria-label="Remind me at" />
        <button type="submit" className="chip-button">Set</button>
      </form>
      {onNone && <button type="button" className="chip-button ghost" onClick={onNone}>{noneLabel ?? "No reminder"}</button>}
    </div>
  );
}

/** A small popover holding ReminderChoices, anchored under its trigger. */
export function Popover({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const timer = setTimeout(() => document.addEventListener("pointerdown", onDown));
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="popover" ref={ref} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}
