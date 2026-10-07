import { useEffect, useRef, useState } from "react";
import { CALENDAR_MIRROR_ENABLED } from "../lib/config";
import { BOOKING_LEAD, formatReminder, formatShowTime, localIsoDate } from "../lib/rules";
import { loadTicketFile, removeTicket, saveTicket, useAppState } from "../lib/store";
import { parseTicket, showTimeOf, type TicketSource } from "../lib/ticket";
import type { ReadStage } from "../lib/ticketReader";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";
import { toast } from "./Toast";

interface Draft {
  date: string;
  time: string;
  cinema: string;
  screen: string;
  seats: string;
  bookingId: string;
  source: TicketSource | string;
}

const timeOf = (at: number) => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

function draftFrom(movie: Movie): Draft {
  const booking = movie.booking;
  return {
    date: booking ? localIsoDate(booking.showAt) : "",
    time: booking ? timeOf(booking.showAt) : "",
    cinema: booking?.cinema ?? "",
    screen: booking?.screen ?? "",
    seats: booking?.seats?.join(", ") ?? "",
    bookingId: booking?.bookingId ?? "",
    source: booking?.source ?? "other"
  };
}

type Mode =
  | { step: "idle" }
  | { step: "reading"; stage: ReadStage; image: boolean }
  | { step: "form"; draft: Draft; file: File | null; found: boolean; keep: boolean };

/**
 * A film's cinema ticket: add one from a screenshot, photo or PDF (read on this device) or by typing it in,
 * check what was read, and then see it as a card with the showtime, cinema, seats and the ticket itself.
 */
export function TicketPanel({ movie }: { movie: Movie }) {
  const { sync, settings } = useAppState();
  const [mode, setMode] = useState<Mode>({ step: "idle" });
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const booking = movie.booking;

  useEffect(() => () => {
    if (viewing) URL.revokeObjectURL(viewing);
  }, [viewing]);

  const startUpload = () => fileInput.current?.click();

  const read = async (file: File) => {
    const { isImage, readTicketText } = await import("../lib/ticketReader");
    setMode({ step: "reading", stage: "loading", image: isImage(file) });
    try {
      const text = await readTicketText(file, (stage) => setMode({ step: "reading", stage, image: isImage(file) }));
      const found = parseTicket(text, Date.now());
      const base = draftFrom(movie);
      const draft: Draft = {
        date: found.date ?? base.date,
        time: found.time ?? base.time,
        cinema: found.cinema ?? base.cinema,
        screen: found.screen ?? base.screen,
        seats: found.seats.length ? found.seats.join(", ") : base.seats,
        bookingId: found.bookingId ?? base.bookingId,
        source: found.source !== "other" ? found.source : base.source
      };
      setMode({ step: "form", draft, file, found: Boolean(found.date || found.time || found.cinema || found.seats.length), keep: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't read that file.");
      setMode({ step: "form", draft: draftFrom(movie), file, found: false, keep: true });
    }
  };

  const save = async () => {
    if (mode.step !== "form") return;
    const showAt = showTimeOf(mode.draft.date, mode.draft.time);
    if (!showAt) {
      toast("Add the show's date and time.");
      return;
    }
    setSaving(true);
    const seats = mode.draft.seats.split(/[\s,;]+/).map((seat) => seat.trim()).filter(Boolean);
    const result = await saveTicket(movie.id, {
      showAt, cinema: mode.draft.cinema, screen: mode.draft.screen, seats, bookingId: mode.draft.bookingId, source: mode.draft.source
    }, mode.file, mode.keep);
    setSaving(false);
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    const reminder = showAt - BOOKING_LEAD > Date.now() ? ` Reminder ${formatReminder(showAt - BOOKING_LEAD)}.` : "";
    const fileNote = mode.keep && mode.file && !result.fileSaved ? " The ticket file is kept on this device only: Google Drive couldn't take it just now." : "";
    toast(`Ticket saved.${reminder}${fileNote}`);
    setMode({ step: "idle" });
  };

  const show = async () => {
    if (!booking) return;
    const pdf = (booking.ticketMime ?? "").includes("pdf") || /\.pdf$/i.test(booking.ticketFileName ?? "");
    // A PDF opens in its own tab, opened here inside the tap so the browser allows it.
    const tab = pdf ? window.open("", "_blank") : null;
    try {
      const file = await loadTicketFile(movie.id);
      if (!file) {
        tab?.close();
        toast(sync.status === "needs-auth" ? "Resume sync to open the ticket from your Drive." : "The ticket file isn't available.");
        return;
      }
      const url = URL.createObjectURL(file);
      if (tab) tab.location.href = url;
      else setViewing(url);
    } catch {
      tab?.close();
      toast("Couldn't open the ticket. Check your connection and try again.");
    }
  };

  const remove = async () => {
    setConfirmingRemove(false);
    if (await removeTicket(movie.id)) toast("Ticket removed");
  };

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*,application/pdf"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void read(file);
      }}
    />
  );

  if (mode.step === "reading") {
    return (
      <div className="ticket-panel" role="status">
        <p className="ticket-reading"><span className="spin"><Icon name="sync" size={16} /></span> Reading your ticket on this device…</p>
        {mode.image && mode.stage === "loading" && <p className="muted small-print">The first time, this downloads text recognition (about 7 MB).</p>}
      </div>
    );
  }

  if (mode.step === "form") {
    const set = (patch: Partial<Draft>) => setMode({ ...mode, draft: { ...mode.draft, ...patch } });
    const canKeep = Boolean(mode.file || booking?.ticketFileId);
    return (
      <form className="ticket-panel ticket-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <p className="muted small-print">
          {mode.file
            ? mode.found ? "Read on this device. Check the details before saving." : "Couldn't read the details from that file. Fill them in below."
            : "Type the details from your ticket."}
        </p>
        <div className="ticket-fields">
          <label><span className="field-label">Date</span><input type="date" required value={mode.draft.date} onChange={(event) => set({ date: event.target.value })} /></label>
          <label><span className="field-label">Time</span><input type="time" required value={mode.draft.time} onChange={(event) => set({ time: event.target.value })} /></label>
          <label className="wide"><span className="field-label">Cinema</span><input value={mode.draft.cinema} onChange={(event) => set({ cinema: event.target.value })} placeholder="PVR: Select Citywalk, Saket" /></label>
          <label><span className="field-label">Screen</span><input value={mode.draft.screen} onChange={(event) => set({ screen: event.target.value })} placeholder="Audi 5" /></label>
          <label><span className="field-label">Seats</span><input value={mode.draft.seats} onChange={(event) => set({ seats: event.target.value })} placeholder="H12, H13" autoCapitalize="characters" /></label>
          <label className="wide"><span className="field-label">Booking ID</span><input value={mode.draft.bookingId} onChange={(event) => set({ bookingId: event.target.value })} autoCapitalize="characters" spellCheck={false} /></label>
        </div>
        {canKeep && (
          <label className="ticket-keep">
            <input type="checkbox" checked={mode.keep} onChange={(event) => setMode({ ...mode, keep: event.target.checked })} />
            <span>Keep the ticket to show at the cinema <small className="muted">(on this device and in your Google Drive)</small></span>
          </label>
        )}
        <div className="button-row">
          <button type="submit" className="button button-ink" disabled={saving}>{saving ? "Saving…" : "Save ticket"}</button>
          <button type="button" className="button button-quiet" disabled={saving} onClick={() => setMode({ step: "idle" })}>Cancel</button>
        </div>
      </form>
    );
  }

  if (booking) {
    const parts = [booking.screen, booking.seats?.length ? `Seat${booking.seats.length > 1 ? "s" : ""} ${booking.seats.join(", ")}` : ""].filter(Boolean);
    return (
      <div className="ticket-panel ticket-card">
        {fileField}
        <div className="ticket-card-head">
          <span className="ticket-icon" aria-hidden="true"><Icon name="ticket" size={20} /></span>
          <div>
            <b className="ticket-when">{formatShowTime(booking.showAt)}</b>
            {booking.cinema && <span className="ticket-where">{booking.cinema}</span>}
            {parts.length > 0 && <span className="ticket-seats">{parts.join(" · ")}</span>}
          </div>
        </div>
        {booking.bookingId && (
          <p className="ticket-id">
            Booking ID <code>{booking.bookingId}</code>
            <button type="button" className="inline-link" onClick={() => void navigator.clipboard?.writeText(booking.bookingId!).then(() => toast("Booking ID copied"), () => undefined)}>Copy</button>
          </p>
        )}
        {booking.showAt - BOOKING_LEAD > Date.now() && (
          <p className="muted small-print">
            Reminder {formatReminder(booking.showAt - BOOKING_LEAD)}{CALENDAR_MIRROR_ENABLED && settings.calendarMirror ? ", and the show is on your Google Calendar" : ""}.
          </p>
        )}
        {confirmingRemove ? (
          <div className="button-row">
            <button type="button" className="button button-danger" onClick={() => void remove()}>Remove ticket</button>
            <button type="button" className="button button-quiet" onClick={() => setConfirmingRemove(false)}>Keep it</button>
          </div>
        ) : (
          <div className="button-row">
            {booking.ticketFileId || booking.ticketFileName ? (
              <button type="button" className="button button-ink" onClick={() => void show()}><Icon name="ticket" size={16} /> Show ticket</button>
            ) : (
              <button type="button" className="button button-ink" onClick={startUpload}>Add the ticket file</button>
            )}
            <button type="button" className="button button-quiet" onClick={() => setMode({ step: "form", draft: draftFrom(movie), file: null, found: false, keep: Boolean(booking.ticketFileId) })}>Edit</button>
            <button type="button" className="button button-quiet" onClick={() => setConfirmingRemove(true)}>Remove</button>
          </div>
        )}
        {viewing && (
          <div className="ticket-viewer" role="dialog" aria-modal="true" aria-label="Your ticket" onClick={() => setViewing(null)}>
            <img src={viewing} alt={`Ticket for ${movie.title}`} />
            <button type="button" className="ticket-viewer-close" onClick={() => setViewing(null)} aria-label="Close ticket"><Icon name="close" size={20} /></button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ticket-panel ticket-empty">
      {fileField}
      <p>Booked a ticket? Add it and FlickCue reminds you an hour before the show.</p>
      <div className="button-row">
        <button type="button" className="button button-ink" onClick={startUpload}><Icon name="ticket" size={16} /> Upload ticket</button>
        <button type="button" className="button button-quiet" onClick={() => setMode({ step: "form", draft: draftFrom(movie), file: null, found: false, keep: false })}>Type it in</button>
      </div>
      <p className="muted small-print">A screenshot, photo or PDF from BookMyShow, District, PVR INOX, Cinépolis or any cinema. It's read on this device and never sent to FlickCue.</p>
    </div>
  );
}
