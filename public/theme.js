// The reader's light/dark pick (src/lib/theme.ts), set before the first paint.
// A file of its own rather than inline, so the page's security policy can refuse inline scripts.
try {
  var theme = localStorage.getItem("flickcue.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (error) {}

// This host can't send a header forbidding other sites from framing these pages, and a framed page can be
// used to trick a click (clickjacking), so a page that finds itself in a frame hides itself instead.
try {
  if (window.top !== window.self) document.documentElement.style.display = "none";
} catch (error) {
  document.documentElement.style.display = "none";
}
