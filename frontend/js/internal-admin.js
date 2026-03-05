document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const repoBase =
      window.location.hostname.endsWith("github.io") && parts.length > 0 ? `/${parts[0]}` : "";
    window.location.href = `${window.location.origin}${repoBase}/admin/`;
  }
});
