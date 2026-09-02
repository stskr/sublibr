(function () {
  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const mobileNav = document.querySelector("[data-mobile-nav]");

  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const setNavOpen = (open) => {
    if (!toggle || !mobileNav) return;
    toggle.setAttribute("aria-expanded", String(open));
    mobileNav.hidden = !open;
    mobileNav.classList.toggle("is-open", open);
  };

  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setNavOpen(open);
  });

  mobileNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNavOpen(false);
  });

  const copyButtons = document.querySelectorAll("[data-copy]");

  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const block = button.closest(".code-block");
      const source = block?.querySelector("[data-copy-source]");
      const text = source?.textContent?.trim();
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const range = document.createElement("textarea");
        range.value = text;
        document.body.appendChild(range);
        range.select();
        document.execCommand("copy");
        range.remove();
      }

      const previous = button.textContent;
      button.textContent = "Copied";
      button.classList.add("is-copied");
      window.setTimeout(() => {
        button.textContent = previous;
        button.classList.remove("is-copied");
      }, 1600);
    });
  });
})();
