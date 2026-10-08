import { useEffect, useRef, useState } from "react";
import { releaseDayReminder, tomorrowReminder, tonightReminder, weekendReminder } from "../lib/rules";
import { useDialog } from "../lib/useDialog";

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
      {/* The quickest way out comes first: save it without a reminder, or clear the one that's set. */}
      {onNone && <button type="button" className="chip-button ghost reminder-none" onClick={onNone}>{noneLabel ?? "No reminder"}</button>}
      {releaseDay && (
        <button type="button" className="chip-button" onClick={() => onPick(releaseDay)}>On release day</button>
      )}
      {/* Tonight or tomorrow means nothing for something that isn't out yet: release day, or a date, instead. */}
      {!releaseDay && (
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
    </div>
  );
}

/**
 * A small popover holding ReminderChoices, anchored under its trigger. Pass the
 * trigger as `anchor` when it toggles the popover, so pressing it counts as the
 * toggle rather than as a press outside that closes and then reopens it.
 */
export function Popover({ open, onClose, children, label, anchor, focusFirst = false, modal = false }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
  anchor?: React.RefObject<HTMLElement | null>;
  /** Opened from the keyboard: the first control takes focus, so Tab doesn't start from the trigger. */
  focusFirst?: boolean;
  modal?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(open && modal, ref, onClose);

  useEffect(() => {
    if (open && focusFirst) ref.current?.querySelector<HTMLElement>("a[href], button:not(:disabled), select")?.focus();
  }, [open, focusFirst]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchor?.current?.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Focus inside the popover goes back to what opened it, rather than to the top of the page.
      if (ref.current?.contains(document.activeElement)) anchor?.current?.focus();
      onClose();
    };
    const timer = setTimeout(() => document.addEventListener("pointerdown", onDown));
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return (
    <div className="popover" ref={ref} role="dialog" aria-modal={modal || undefined} aria-label={label} tabIndex={-1}>
      {modal && <button type="button" className="dialog-close" onClick={onClose} aria-label={`Close ${label}`}>Close</button>}
      {children}
    </div>
  );
}
