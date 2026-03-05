const cartBody = document.getElementById("cartBody");
const cartTotal = document.getElementById("cartTotal");
const cartCountLabel = document.getElementById("cartCount");
const paymentMessage = document.getElementById("paymentMessage");
const checkoutWhatsappBtn = document.getElementById("checkoutWhatsappBtn");
const customerNameInput = document.getElementById("customerName");
const customerPhoneInput = document.getElementById("customerPhone");
const customerStatus = document.getElementById("customerStatus");
const accountLink = document.getElementById("accountLink");
const authRequiredBox = document.getElementById("authRequiredBox");
const customerDataFormWrap = document.getElementById("customerDataFormWrap");

function setPaymentMessage(text, isError = false) {
  paymentMessage.className = `message ${isError ? "error" : "success"}`;
  paymentMessage.textContent = text;
}

function setLocalFromBackend(items) {
  const local = items.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity
  }));
  API.saveLocalCart(local);
  const count = local.reduce((acc, item) => acc + item.quantity, 0);
  cartCountLabel.textContent = count;
}

async function loadCart() {
  const clientId = API.getClientId();
  const cart = await API.request(`/api/cart/${clientId}`);

  setLocalFromBackend(cart.items);
  cartBody.innerHTML = "";

  cart.items.forEach((item) => {
    const subtotal = item.price * item.quantity;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${API.formatCurrency(item.price)}</td>
      <td><input type="number" min="1" data-qty-id="${item.product_id}" value="${item.quantity}" /></td>
      <td>${API.formatCurrency(subtotal)}</td>
      <td><button class="secondary" data-remove-id="${item.product_id}">Remover</button></td>
    `;
    cartBody.appendChild(row);
  });

  cartTotal.textContent = `Total: ${API.formatCurrency(cart.total)}`;
}

async function syncAndReload() {
  const clientId = API.getClientId();
  const items = API.getLocalCart();
  await API.request(`/api/cart/${clientId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items })
  });
  await loadCart();
}

document.addEventListener("change", async (event) => {
  if (event.target.matches("[data-qty-id]")) {
    const productId = Number(event.target.getAttribute("data-qty-id"));
    const quantity = Math.max(1, Number(event.target.value) || 1);
    const items = API.getLocalCart().map((item) =>
      item.product_id === productId ? { ...item, quantity } : item
    );
    API.saveLocalCart(items);
    await syncAndReload();
  }
});

document.addEventListener("click", async (event) => {
  if (event.target.matches("[data-remove-id]")) {
    const productId = Number(event.target.getAttribute("data-remove-id"));
    const items = API.getLocalCart().filter((item) => item.product_id !== productId);
    API.saveLocalCart(items);
    await syncAndReload();
  }
});

function loadCustomerDraft() {
  customerNameInput.value = localStorage.getItem("gd_customer_name") || "";
  customerPhoneInput.value = API.formatPhoneBr(localStorage.getItem("gd_customer_phone") || "");
}

function saveCustomerDraft() {
  localStorage.setItem("gd_customer_name", customerNameInput.value.trim());
  localStorage.setItem("gd_customer_phone", API.formatPhoneBr(customerPhoneInput.value));
}

function clearCustomerDraft() {
  localStorage.removeItem("gd_customer_name");
  localStorage.removeItem("gd_customer_phone");
  customerNameInput.value = "";
  customerPhoneInput.value = "";
}

function setCheckoutAuthState(isAuthenticated) {
  if (authRequiredBox) authRequiredBox.style.display = isAuthenticated ? "none" : "block";
  if (customerDataFormWrap) customerDataFormWrap.style.display = isAuthenticated ? "grid" : "none";
  checkoutWhatsappBtn.disabled = !isAuthenticated;
}

async function checkoutViaWhatsapp() {
  try {
    const token = API.getCustomerToken();
    if (!token) {
      setPaymentMessage("Faca login em Conta para finalizar o pedido.", true);
      window.location.href = "/account";
      return;
    }

    saveCustomerDraft();

    const response = await API.request("/api/checkout/whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        clientId: API.getClientId(),
        customerName: customerNameInput.value.trim(),
        customerPhone: customerPhoneInput.value.trim()
      })
    });

    setPaymentMessage(`Pedido #${response.orderId} criado. Redirecionando para o WhatsApp...`);
    API.saveLocalCart([]);
    cartCountLabel.textContent = "0";
    await loadCart();
    window.open(response.whatsappUrl, "_blank");
  } catch (error) {
    setPaymentMessage(error.message, true);
  }
}

async function loadCustomerProfile() {
  const token = API.getCustomerToken();
  const profile = API.getCustomerProfile();

  if (!token || !profile) {
    customerStatus.textContent = "Entre na sua conta para finalizar o pedido.";
    setCheckoutAuthState(false);
    if (accountLink) accountLink.textContent = "Entrar";
    clearCustomerDraft();
    return;
  }

  try {
    const me = await API.request("/api/customers/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    customerStatus.textContent = `Logado como ${me.name} (${me.email})`;
    customerNameInput.value = me.name;
    customerPhoneInput.value = API.formatPhoneBr(me.phone);
    localStorage.setItem("gd_customer_name", me.name);
    localStorage.setItem("gd_customer_phone", API.formatPhoneBr(me.phone));
    if (accountLink) accountLink.textContent = `Conta (${me.name.split(" ")[0]})`;
    setCheckoutAuthState(true);
  } catch (error) {
    API.clearCustomerSession();
    customerStatus.textContent = "Sessao expirada. Entre novamente para finalizar o pedido.";
    setCheckoutAuthState(false);
    if (accountLink) accountLink.textContent = "Entrar";
    clearCustomerDraft();
  }
}

customerNameInput.addEventListener("blur", saveCustomerDraft);
customerPhoneInput.addEventListener("blur", saveCustomerDraft);
customerPhoneInput.addEventListener("input", () => {
  customerPhoneInput.value = API.formatPhoneBr(customerPhoneInput.value);
});
checkoutWhatsappBtn.addEventListener("click", checkoutViaWhatsapp);

(async function bootstrap() {
  setCheckoutAuthState(false);
  await loadCustomerProfile();
  await loadCart();
})();
