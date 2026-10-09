window.__ui = {
  click(text) {
    const lower = text.toLowerCase();
    const candidates = [...document.querySelectorAll("button, a, [role=button], summary, label")]
      .filter((e) => e.offsetParent !== null && e.textContent.trim().toLowerCase().includes(lower))
      .sort((a, b) => a.textContent.length - b.textContent.length);
    if (!candidates[0]) return "missing " + text;
    candidates[0].click();
    return "clicked " + candidates[0].tagName + " " + candidates[0].textContent.trim().slice(0, 40);
  },
  buttons() {
    return [...document.querySelectorAll("button, a, [role=button]")].filter((e) => e.offsetParent !== null)
      .map((e) => (e.textContent.trim() || e.getAttribute("aria-label") || e.title || "?").slice(0, 30));
  },
  key(key, opts = {}) {
    document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, ...opts}));
    window.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, ...opts}));
    return "key " + key;
  }
};
"ui ready";
