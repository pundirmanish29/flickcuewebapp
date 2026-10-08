import { Component, type ErrorInfo, type ReactNode } from "react";

/** What a person sees when the app hits an error it didn't expect: it says so, and offers the two ways out. */
export function CrashNotice() {
  return (
    <main className="app-error" role="alert">
      <h1>Something went wrong</h1>
      <p>FlickCue hit a problem it didn't expect. Your list is safe: it's saved on this device and in your Google Drive.</p>
      <p className="app-error-actions">
        <button type="button" className="button button-ink" onClick={() => location.reload()}>Reload FlickCue</button>
        <a className="button button-quiet" href="./contact.html">Tell us what happened</a>
      </p>
    </main>
  );
}

/**
 * Catches an error thrown while the app draws itself, so one broken screen shows CrashNotice instead of
 * a blank page. Nothing about the error is shown or sent anywhere; it goes to the browser console only.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FlickCue crashed:", error, info.componentStack);
  }

  render() {
    return this.state.failed ? <CrashNotice /> : this.props.children;
  }
}
