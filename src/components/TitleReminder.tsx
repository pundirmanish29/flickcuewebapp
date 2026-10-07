import { useRef, useState } from "react";
import * as actions from "../lib/actions";
import { displayTitle, isUnreleased } from "../lib/rules";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";
import { Popover, ReminderChoices } from "./ReminderMenu";

export function TitleReminder({ movie }: { movie: Movie }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return <div className="title-reminder">
    <button ref={anchor} type="button" className="icon-button" onClick={() => setOpen(value => !value)} aria-label={`Set reminder for ${displayTitle(movie)}`} aria-expanded={open} title="Choose reminder"><Icon name="clock" /></button>
    {open && <div className="reminder-scrim" aria-hidden="true" />}
    <Popover open={open} onClose={close} anchor={anchor} label={`Reminder for ${displayTitle(movie)}`} modal>
      <p className="popover-label">Remind me about {displayTitle(movie)}</p>
      <ReminderChoices releaseDate={isUnreleased(movie) ? movie.releaseDate : undefined} onPick={at => { actions.remindAt(movie.id, at); close(); }} onNone={movie.remindAt != null ? () => { actions.clearReminder(movie.id); close(); } : undefined} noneLabel="Clear reminder" />
    </Popover>
  </div>;
}
