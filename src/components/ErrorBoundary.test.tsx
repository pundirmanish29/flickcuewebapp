import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CrashNotice, ErrorBoundary } from "./ErrorBoundary";

describe("the crash notice", () => {
  it("says something went wrong, that the list is safe, and offers a reload and the contact page", () => {
    const html = renderToStaticMarkup(<CrashNotice />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Your list is safe");
    expect(html).toContain("Reload FlickCue");
    expect(html).toContain('href="./contact.html"');
  });

  it("shows nothing of the error itself", () => {
    expect(renderToStaticMarkup(<CrashNotice />)).not.toMatch(/stack|undefined|TypeError/i);
  });
});

describe("the error boundary", () => {
  it("turns a caught error into the failed state, and draws its children otherwise", () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    expect(renderToStaticMarkup(<ErrorBoundary><p>fine</p></ErrorBoundary>)).toBe("<p>fine</p>");
  });
});
