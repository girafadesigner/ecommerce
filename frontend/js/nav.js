function normalizePathname(pathname) {
  const raw = String(pathname || "").trim();
  if (!raw || raw === "/") return "/";

  const normalized = raw.replace(/\/+$/, "");
  if (normalized.endsWith("/index.html")) {
    return normalized.slice(0, -"/index.html".length) || "/";
  }

  return normalized;
}

function markActiveNavLink() {
  const currentPath = normalizePathname(window.location.pathname);
  const links = document.querySelectorAll(".top-links a[href]");

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    const resolved = new URL(href, window.location.href);
    if (resolved.origin !== window.location.origin) return;

    const linkPath = normalizePathname(resolved.pathname);
    const isActive = currentPath === linkPath;

    link.classList.toggle("is-active-nav", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

markActiveNavLink();
