const API = {
  async request(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Erro na requisicao.");
    }
    return data;
  },

  getClientId() {
    let clientId = localStorage.getItem("gd_client_id");
    if (!clientId) {
      clientId = `client_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      localStorage.setItem("gd_client_id", clientId);
    }
    return clientId;
  },

  getLocalCart() {
    const raw = localStorage.getItem("gd_cart");
    return raw ? JSON.parse(raw) : [];
  },

  saveLocalCart(items) {
    localStorage.setItem("gd_cart", JSON.stringify(items));
  },

  getCustomerToken() {
    return localStorage.getItem("gd_customer_token");
  },

  saveCustomerSession(data) {
    localStorage.setItem("gd_customer_token", data.token);
    localStorage.setItem("gd_customer_profile", JSON.stringify(data.customer));
  },

  clearCustomerSession() {
    localStorage.removeItem("gd_customer_token");
    localStorage.removeItem("gd_customer_profile");
  },

  getCustomerProfile() {
    const raw = localStorage.getItem("gd_customer_profile");
    return raw ? JSON.parse(raw) : null;
  },

  formatCurrency(value) {
    return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  normalizePhoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  },

  formatPhoneBr(value) {
    let digits = API.normalizePhoneDigits(value);
    if (!digits) return "";

    // Se vier com DDI 55, usa o padrao nacional para exibicao.
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      digits = digits.slice(2);
    }

    if (digits.length <= 10) {
      const ddd = digits.slice(0, 2);
      const part1 = digits.slice(2, 6);
      const part2 = digits.slice(6, 10);
      if (!ddd) return digits;
      if (!part1) return `(${ddd})`;
      if (!part2) return `(${ddd}) ${part1}`;
      return `(${ddd}) ${part1}-${part2}`;
    }

    const ddd = digits.slice(0, 2);
    const part1 = digits.slice(2, 7);
    const part2 = digits.slice(7, 11);
    if (!ddd) return digits;
    if (!part1) return `(${ddd})`;
    if (!part2) return `(${ddd}) ${part1}`;
    return `(${ddd}) ${part1}-${part2}`;
  }
};
