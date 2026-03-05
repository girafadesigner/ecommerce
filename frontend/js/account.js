const accountMessage = document.getElementById("accountMessage");
const sessionPanel = document.getElementById("sessionPanel");
const authPanel = document.getElementById("authPanel");
const profileText = document.getElementById("customerProfile");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const forgotCustomerForm = document.getElementById("forgotCustomerForm");
const registerPhoneInput = document.getElementById("registerPhone");
const customerOrdersTable = document.getElementById("customerOrdersTable");
const customerOrdersScroll = document.getElementById("customerOrdersScroll");
const customerOrdersBody = document.getElementById("customerOrdersBody");
const customerOrdersEmpty = document.getElementById("customerOrdersEmpty");

function setMessage(text, isError = false) {
  accountMessage.innerHTML = `<div class="message ${isError ? "error" : "success"}">${text}</div>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSqliteUtcToBr(dateValue) {
  if (!dateValue) return "-";
  const isoUtc = `${String(dateValue).replace(" ", "T")}Z`;
  const parsed = new Date(isoUtc);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short"
  }).format(parsed);
}

function customerOrderStatusLabel(status) {
  if (status === "paid_confirmed") return "Pagamento confirmado";
  if (status === "in_production" || status === "em_producao") return "Em producao";
  if (status === "pending_delivery" || status === "pronto_entrega") return "Pronto para entrega";
  if (status === "delivered" || status === "entregue") return "Entregue";
  if (status === "abandoned") return "Compra desistida";
  if (status === "cancelled" || status === "cancelado") return "Cancelado";
  if (status === "refunded") return "Reembolsado";
  return "Pendente";
}

async function loadCustomerOrders() {
  const token = API.getCustomerToken();
  if (!token) return;

  const orders = await API.request("/api/customers/orders?limit=10", {
    headers: { Authorization: `Bearer ${token}` }
  });

  customerOrdersBody.innerHTML = "";
  if (!orders.length) {
    customerOrdersScroll.style.display = "none";
    customerOrdersEmpty.style.display = "block";
    return;
  }

  customerOrdersEmpty.style.display = "none";
  customerOrdersScroll.style.display = "block";
  customerOrdersTable.style.display = "table";
  orders.forEach((order) => {
    const row = document.createElement("tr");
    const itemsLabel = (order.items || [])
      .map((item) => `${item.product_name} (x${item.quantity})`)
      .join(", ");

    row.innerHTML = `
      <td>#${order.id}</td>
      <td>${formatSqliteUtcToBr(order.created_at)}</td>
      <td><span class="status-chip ${order.status}">${customerOrderStatusLabel(order.status)}</span></td>
      <td>${API.formatCurrency(order.total)}</td>
      <td>${itemsLabel || "-"}</td>
    `;
    customerOrdersBody.appendChild(row);
  });
}

function renderSession() {
  const profile = API.getCustomerProfile();
  const token = API.getCustomerToken();
  const isLogged = Boolean(profile && token);

  sessionPanel.style.display = isLogged ? "block" : "none";
  authPanel.style.display = isLogged ? "none" : "block";

  if (isLogged) {
    const formattedPhone = API.formatPhoneBr(profile.phone);
    profileText.innerHTML = `
      <span class="profile-line"><strong>Meu nome:</strong> ${escapeHtml(profile.name)}</span>
      <span class="profile-line"><strong>Meu email:</strong> ${escapeHtml(profile.email)}</span>
      <span class="profile-line"><strong>Meu telefone:</strong> ${escapeHtml(formattedPhone || "-")}</span>
    `;
    loadCustomerOrders().catch((error) => setMessage(error.message, true));
  } else {
    customerOrdersBody.innerHTML = "";
    customerOrdersScroll.style.display = "none";
    customerOrdersEmpty.style.display = "none";
  }
}

async function login(email, password) {
  const data = await API.request("/api/customers/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  API.saveCustomerSession(data);
  return data;
}

async function register(name, email, phone, password) {
  const data = await API.request("/api/customers/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone, password })
  });
  API.saveCustomerSession(data);
  return data;
}

document.getElementById("showLoginBtn").addEventListener("click", () => {
  loginForm.style.display = "grid";
  registerForm.style.display = "none";
  forgotCustomerForm.style.display = "none";
});

document.getElementById("showRegisterBtn").addEventListener("click", () => {
  loginForm.style.display = "none";
  registerForm.style.display = "grid";
  forgotCustomerForm.style.display = "none";
});

document.getElementById("showForgotCustomerBtn").addEventListener("click", () => {
  loginForm.style.display = "none";
  registerForm.style.display = "none";
  forgotCustomerForm.style.display = "grid";
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await login(
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPassword").value
    );
    setMessage("Login realizado com sucesso.");
    renderSession();
  } catch (error) {
    setMessage(error.message, true);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await register(
      document.getElementById("registerName").value.trim(),
      document.getElementById("registerEmail").value.trim(),
      document.getElementById("registerPhone").value.trim(),
      document.getElementById("registerPassword").value
    );
    setMessage("Cadastro realizado com sucesso.");
    renderSession();
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.getElementById("sendCustomerCodeBtn").addEventListener("click", async () => {
  try {
    const email = document.getElementById("forgotCustomerEmail").value.trim();
    const channel = "email";
    const data = await API.request("/api/customers/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, channel })
    });
    setMessage(
      `${data.message} Canal: ${data.channel}. Destino: ${data.destination}. Expira em ${data.expiresInMinutes} min.`
    );
  } catch (error) {
    setMessage(error.message, true);
  }
});

forgotCustomerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const email = document.getElementById("forgotCustomerEmail").value.trim();
    const code = document.getElementById("forgotCustomerCode").value.trim();
    const newPassword = document.getElementById("forgotCustomerNewPassword").value;

    await API.request("/api/customers/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword })
    });

    setMessage("Senha redefinida. Agora entre com a nova senha.");
    forgotCustomerForm.reset();
    loginForm.style.display = "grid";
    registerForm.style.display = "none";
    forgotCustomerForm.style.display = "none";
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.getElementById("logoutCustomerBtn").addEventListener("click", () => {
  API.clearCustomerSession();
  setMessage("Sessao encerrada.");
  renderSession();
});

registerPhoneInput?.addEventListener("input", () => {
  registerPhoneInput.value = API.formatPhoneBr(registerPhoneInput.value);
});

renderSession();
