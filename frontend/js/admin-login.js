const loginForm = document.getElementById("loginForm");
const messageBox = document.getElementById("loginMessage");
const forgotAdminForm = document.getElementById("forgotAdminForm");

function setMessage(text, isError = false) {
  messageBox.innerHTML = `<div class="message ${isError ? "error" : "success"}">${text}</div>`;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const data = await API.request("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem("gd_admin_token", data.token);
    window.location.href = "/admin/panel";
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.getElementById("showForgotAdminBtn").addEventListener("click", () => {
  loginForm.style.display = "none";
  forgotAdminForm.style.display = "grid";
});

document.getElementById("sendAdminCodeBtn").addEventListener("click", async () => {
  try {
    const username = document.getElementById("forgotAdminUsername").value.trim();
    const channel = document.getElementById("forgotAdminChannel").value;
    const data = await API.request("/api/admin/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, channel })
    });
    setMessage(
      `${data.message} Canal: ${data.channel}. Destino: ${data.destination}. Expira em ${data.expiresInMinutes} min.`
    );
  } catch (error) {
    setMessage(error.message, true);
  }
});

forgotAdminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const username = document.getElementById("forgotAdminUsername").value.trim();
    const code = document.getElementById("forgotAdminCode").value.trim();
    const newPassword = document.getElementById("forgotAdminNewPassword").value;

    await API.request("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, code, newPassword })
    });

    setMessage("Senha admin redefinida. Entre com a nova senha.");
    forgotAdminForm.reset();
    forgotAdminForm.style.display = "none";
    loginForm.style.display = "grid";
  } catch (error) {
    setMessage(error.message, true);
  }
});
