import { useEffect, useRef, type RefObject } from "react";

/** Keep modal interaction inside the dialog and return to the opener on dismissal. */
export function useDialog(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    const isolated: [HTMLElement, boolean][] = [];
    let branch: HTMLElement = dialog;
    while (branch.parentElement && branch !== document.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          isolated.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(e => e.getClientRects().length > 0);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (controls()[0] ?? dialog).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0] ?? dialog;
      const last = items.at(-1) ?? dialog;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      for (const [element, inert] of isolated) element.inert = inert;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
