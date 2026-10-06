import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

/**
 * A heading that is also a menu ("On Netflix ▾"): the heading names what's
 * shown, and opens a short list of the other choices. Drawn by the page
 * rather than the browser, so the list matches the heading it hangs from.
 */
export function HeadingMenu({ label, value, options, onPick }: {
  /** What is being chosen ("Streaming service"), for screen readers. */
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const show = () => {
    setActive(Math.max(0, options.findIndex((option) => option.id === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (choice: string) => {
    onPick(choice);
    close();
  };
  const onListKey = (event: KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(options[active].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div className="heading-menu">
      <button
        ref={button}
        type="button"
        className="heading-menu-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        <span className="visually-hidden">{label}: </span>
        <span>{current.label}</span>
        <Icon name="chevron" size={20} />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="heading-menu-list"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.id === current.id}
              className={index === active ? "active" : undefined}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(option.id)}
            >
              {option.label}
              {option.id === current.id && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
