import { useEffect, useSyncExternalStore } from "react";

// One toast at a time, optionally with an action (Undo). A new toast replaces
// the old one, the way a snackbar does.

interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

let current: ToastMessage | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function toast(text: string, action?: ToastMessage["action"]) {
  current = { id: nextId++, text, action };
  emit();
}

function dismiss(id: number) {
  if (current?.id === id) {
    current = null;
    emit();
  }
}

export function ToastHost() {
  const message = useSyncExternalStore(
    (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    () => current
  );

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => dismiss(message.id), message.action ? 6000 : 3200);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div className="toast" key={message.id}>
          <span>{message.text}</span>
          {message.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                message.action!.run();
                dismiss(message.id);
              }}
            >
              {message.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
