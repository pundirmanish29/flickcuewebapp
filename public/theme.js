// The reader's light/dark pick (src/lib/theme.ts), set before the first paint.
// A file of its own rather than inline, so the page's security policy can refuse inline scripts.
try {
  var theme = localStorage.getItem("flickcue.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (error) {}
