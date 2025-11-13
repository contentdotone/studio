/**
 * testupdate 
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

  let layoutHoverStylesInjected = false;
  let editHelpersActive = false;
  let currentEditTarget = null;
  let editBubbleEl = null;
  let editContentTarget = null;
  let editContentPrevAttr = null;
  const TEXT_ELEMENT_SELECTOR =
    'p, span, li, a, blockquote, h1, h2, h3, h4, h5, h6, figcaption, label';
  const EDIT_BLOCKED_EVENTS = [
    "click",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "dblclick",
    "contextmenu",
  ];

  const ensureLayoutHoverStyles = () => {
    console.log("[communicator] ensureLayoutHoverStyles invoked");

    if (!document.head) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          ensureLayoutHoverStyles();
        },
        { once: true }, 
      );  
      return;
    }

    if (!layoutHoverStylesInjected) {
      const style = document.createElement("style");
      style.id = "studio-layout-hover-style";
      style.textContent = `
      [data-studio-mode="Layout"] div {
        transition: box-shadow 120ms ease, transform 120ms ease;
      } 
      [data-studio-mode="Layout"] div:hover {
        box-shadow: 0 12px 24px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(248, 250, 252, 0.25);
        cursor: move !important;
      }
    `;
      document.head.appendChild(style);
      layoutHoverStylesInjected = true;
      console.log("[communicator] layout hover helpers injected");
    }
  };

  const getXPath = (element) => {
    if (!element) return "";
    if (element.id) return `//*[@id="${element.id}"]`;
    const segments = [];
    let el = element;
    while (el && el.nodeType === Node.ELEMENT_NODE && el !== document.documentElement) {
      let index = 1;
      let sibling = el.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === el.tagName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      segments.unshift(`${el.tagName.toLowerCase()}[${index}]`);
      el = el.parentElement;
    }
    return `/${segments.join("/")}`;
  };

  const ensureEditBubble = () => {
    if (editBubbleEl) return editBubbleEl;
    const bubble = document.createElement("div");
    bubble.id = "studio-edit-bubble";
    bubble.style.position = "absolute";
    bubble.style.zIndex = "99999";
    bubble.style.pointerEvents = "none";
    bubble.style.background = "rgba(15, 23, 42, 0.95)";
    bubble.style.color = "#E2E8F0";
    bubble.style.fontSize = "12px";
    bubble.style.padding = "6px 10px";
    bubble.style.borderRadius = "999px";
    bubble.style.boxShadow = "0 12px 24px rgba(15, 23, 42, 0.45)";
    bubble.style.border = "1px solid rgba(255,255,255,0.15)";
    bubble.style.whiteSpace = "nowrap";
    bubble.style.opacity = "0";
    bubble.style.transition = "opacity 120ms ease";
    document.body.appendChild(bubble);
    editBubbleEl = bubble;
    return bubble;
  };

  const positionEditBubble = (target) => {
    if (!editBubbleEl || !target) return;
    const rect = target.getBoundingClientRect();
    const top = window.scrollY + rect.bottom + 8;
    const center = rect.left + rect.width / 2;
    editBubbleEl.style.top = `${top}px`;
    editBubbleEl.style.left = `${Math.max(
      12,
      Math.min(
        window.scrollX + document.documentElement.clientWidth - editBubbleEl.offsetWidth - 12,
        center - editBubbleEl.offsetWidth / 2,
      ),
    )}px`;
    editBubbleEl.style.opacity = "1";
  };

  const hideEditBubble = () => {
    if (editBubbleEl) {
      editBubbleEl.style.opacity = "0";
    }
    currentEditTarget = null;
  };

  const ensureEditCursorStyles = () => {
    if (!document.head) {
      document.addEventListener("DOMContentLoaded", ensureEditCursorStyles, { once: true });
      return;
    }
    if (document.getElementById("studio-edit-cursor-style")) return;
    const style = document.createElement("style");
    style.id = "studio-edit-cursor-style";
    const selectorList = TEXT_ELEMENT_SELECTOR.split(",").map((sel) => sel.trim());
    const combined = selectorList.map((sel) => `[data-studio-mode="Edit"] ${sel}`).join(",\n");
    style.textContent = `
      ${combined} {
        cursor: text !important;
      }
    `;
    document.head.appendChild(style);
  };

  const applyContentEditableTarget = (target) => {
    if (!target || editContentTarget === target) return;

    if (editContentTarget) {
      if (editContentPrevAttr === null) {
        editContentTarget.removeAttribute("contenteditable");
      } else {
        editContentTarget.setAttribute("contenteditable", editContentPrevAttr);
      }
      editContentTarget.classList.remove("studio-edit-inline");
    }

    editContentPrevAttr = target.hasAttribute("contenteditable")
      ? target.getAttribute("contenteditable")
      : null;
    target.setAttribute("contenteditable", "true");
    target.classList.add("studio-edit-inline");
    if (typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
    }
    editContentTarget = target;
  };

  const clearContentEditableTarget = () => {
    if (!editContentTarget) return;
    if (editContentPrevAttr === null) {
      editContentTarget.removeAttribute("contenteditable");
    } else {
      editContentTarget.setAttribute("contenteditable", editContentPrevAttr);
    }
    editContentTarget.classList.remove("studio-edit-inline");
    editContentTarget = null;
    editContentPrevAttr = null;
  };

  const handleEditHover = (event) => {
    const candidate = event.target?.closest?.(TEXT_ELEMENT_SELECTOR);
    if (!candidate) {
      hideEditBubble();
      clearContentEditableTarget();
      return;
    }
    ensureEditBubble();
    ensureEditCursorStyles();
    applyContentEditableTarget(candidate);
    const xpath = getXPath(candidate);
    editBubbleEl.textContent = xpath || candidate.tagName.toLowerCase();
    currentEditTarget = candidate;
    requestAnimationFrame(() => positionEditBubble(candidate));
  };

  const refreshEditBubblePosition = () => {
    if (!currentEditTarget) return;
    requestAnimationFrame(() => positionEditBubble(currentEditTarget));
  };

  const preventEditInteractions = (event) => {
    if (event.target?.closest?.('.studio-edit-inline,[contenteditable="true"]')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  };

  const enableEditHelpers = () => {
    if (editHelpersActive) return;
    if (!document.body) {
      window.addEventListener(
        "load",
        () => {
          enableEditHelpers();
        },
        { once: true },
      );
      return;
    }
    editHelpersActive = true;
    document.addEventListener("mousemove", handleEditHover, true);
    document.addEventListener("mouseleave", hideEditBubble, true);
    window.addEventListener("scroll", refreshEditBubblePosition, true);
    window.addEventListener("resize", refreshEditBubblePosition, true);
    EDIT_BLOCKED_EVENTS.forEach((eventName) =>
      document.addEventListener(eventName, preventEditInteractions, true),
    );
  };

  const disableEditHelpers = () => {
    if (!editHelpersActive) return;
    editHelpersActive = false;
    document.removeEventListener("mousemove", handleEditHover, true);
    document.removeEventListener("mouseleave", hideEditBubble, true);
    window.removeEventListener("scroll", refreshEditBubblePosition, true);
    window.removeEventListener("resize", refreshEditBubblePosition, true);
    EDIT_BLOCKED_EVENTS.forEach((eventName) =>
      document.removeEventListener(eventName, preventEditInteractions, true),
    );
    hideEditBubble();
    clearContentEditableTarget();
  };
  
  const watchModeAttribute = () => {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.attributeName === "data-studio-mode") {
          if (document.documentElement.getAttribute("data-studio-mode") === "Layout") {
            ensureLayoutHoverStyles();
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
  };

  const appliedMode = () => document.documentElement.getAttribute("data-studio-mode");

  const applyMode = (mode) => {
    const current = appliedMode();
    if (current === mode) {
      console.log(`[communicator] mode already ${mode}, skipping attribute update`);
    } else {
      document.documentElement.setAttribute("data-studio-mode", mode);
      console.log(`[communicator] data-studio-mode set to ${mode}`);
    }

    if (mode === "Layout") {
      ensureLayoutHoverStyles();
    } else {
      // layout helpers don't need explicit teardown
    }

    if (mode === "Edit") {
      enableEditHelpers();
    } else {
      disableEditHelpers();
    }

    const display = document.querySelector("[data-mode-display]");
    if (display) display.textContent = mode;

    // Surface a log so automated tests or manual QA can assert the active mode quickly.
    console.log(`[communicator] mode applied: ${mode}`);

    postToParent("mode-applied", { mode, at: Date.now() });
  };

  document.addEventListener("DOMContentLoaded", () => {
    watchModeAttribute();
    if (document.documentElement.getAttribute("data-studio-mode") === "Layout") {
      ensureLayoutHoverStyles();
    }
  });

  window.addEventListener("message", (event) => {
    if (!isAllowedOrigin(event.origin)) return;
    const { channel, type, payload } = event.data || {};
    if (channel !== CHANNEL) return;

    if (type === "set-mode" && payload?.mode) {
      applyMode(payload.mode);
    }
  });

  const notifyParentReady = () => {
    postToParent("child-ready", { path: window.location.pathname });
  };

  window.addEventListener("load", notifyParentReady);
})();
