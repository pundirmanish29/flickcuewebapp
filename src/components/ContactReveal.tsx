import { useState } from "react";
import { SUPPORT_EMAIL } from "../lib/config";
import { toast } from "./Toast";

/**
 * "Contact" that shows the support address when clicked, with a Copy button,
 * instead of a mailto: link. On a computer with no mail app set up, mailto:
 * does nothing at all, and the address is what people actually need.
 */
export function ContactReveal({ label, className = "" }: { label: string; className?: string }) {
  const [shown, setShown] = useState(false);

  if (!shown) {
    return (
      <button type="button" className={`link-button inline contact-reveal-toggle ${className}`} onClick={() => setShown(true)}>
        {label}
      </button>
    );
  }

  const copy = () =>
    navigator.clipboard.writeText(SUPPORT_EMAIL).then(
      () => toast("Email address copied"),
      () => toast("Couldn't copy. Select the address instead.")
    );

  return (
    <span className={`contact-reveal ${className}`}>
      <span className="contact-address">{SUPPORT_EMAIL}</span>
      <button type="button" className="link-button inline" onClick={copy}>Copy</button>
    </span>
  );
}
