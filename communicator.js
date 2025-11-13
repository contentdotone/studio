/**
 * communicator.js
 * Script intended to run inside the iframe content so the parent shell can talk to it.
 * Include this file on the page rendered in the iframe, e.g.
 * <script src="https://your-cdn/communicator.js" defer></script>
 */
(function () {
  const CHANNEL = "studio-shell";

  /**
   * Update the list below with the exact origins that are allowed to control this iframe.
   * Example: ["https://studio.content.one", "http://localhost:4173"]
   */
  const ALLOWED_PARENTS = (window.STUDIO_PARENT_ORIGINS || ["http://127.0.0.1:5500"]).filter(Boolean);
  const TARGET_PARENT_ORIGIN = window.STUDIO_PARENT_TARGET_ORIGIN || "*";

  const isAllowedOrigin = (origin) =>
    origin === "null" ||
    ALLOWED_PARENTS.includes("*") ||
    ALLOWED_PARENTS.includes(origin);

  const postToParent = (type, payload = {}) => {
    if (!window.parent) return;
    window.parent.postMessage({ channel: CHANNEL, type, payload }, TARGET_PARENT_ORIGIN);
  };

  const applyMode = (mode) => {
    document.documentElement.setAttribute("data-studio-mode", mode);

    const display = document.querySelector("[data-mode-display]");
    if (display) display.textContent = mode;

    // Surface a log so automated tests or manual QA can assert the active mode quickly.
    console.log(`[communicator] mode applied: ${mode}`);

    postToParent("mode-applied", { mode, at: Date.now() });
  };

  window.addEventListener("message", (event) => {
    if (!isAllowedOrigin(event.origin)) return;
    const { channel, type, payload } = event.data || {};
    if (channel !== CHANNEL) return;

    if (type === "set-mode" && payload?.mode) {
      applyMode(payload.mode);
    }
  });

  window.addEventListener("DOMContentLoaded", () => {
    postToParent("child-ready", { path: window.location.pathname });
  });
})();
