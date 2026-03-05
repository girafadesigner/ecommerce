function normalizePathname(pathname) {
  const raw = String(pathname || "");
  if (!raw || raw === "/") return "/";
  return raw.replace(/\/+$/, "");
}

function markActiveNavLink() {
  const currentPath = normalizePathname(window.location.pathname);
  const links = document.querySelectorAll(".top-links a[href]");

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/")) return;

    const linkPath = normalizePathname(href);
    const isActive =
      currentPath === linkPath ||
      (linkPath !== "/" && currentPath.startsWith(`${linkPath}/`));

    link.classList.toggle("is-active-nav", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

markActiveNavLink();
