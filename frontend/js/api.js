function detectApiBaseUrl() {
  const queryApiBaseUrl = new URLSearchParams(window.location.search).get("api_base_url");
  if (queryApiBaseUrl && /^https?:\/\//i.test(queryApiBaseUrl.trim())) {
    const normalized = queryApiBaseUrl.trim().replace(/\/+$/, "");
    localStorage.setItem("gd_api_base_url", normalized);
    return normalized;
  }

  const configured = String(window.GD_API_BASE_URL || localStorage.getItem("gd_api_base_url") || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const { protocol, hostname, port } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (protocol === "file:" || (isLocalHost && port !== "3000")) {
    return "http://localhost:3000";
  }

  return "";
}

const API = {
  baseUrl: detectApiBaseUrl(),

  resolveUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!API.baseUrl) return raw;
    return raw.startsWith("/") ? `${API.baseUrl}${raw}` : `${API.baseUrl}/${raw}`;
  },

  resolveAssetUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!API.baseUrl) return raw;
    return raw.startsWith("/") ? `${API.baseUrl}${raw}` : `${API.baseUrl}/${raw}`;
  },

  async request(url, options = {}) {
    const rawUrl = String(url || "").trim();
    const host = String(window.location.hostname || "").toLowerCase();
    const isGithubPages = host.endsWith("github.io");
    const isApiPath = rawUrl.startsWith("/api") || rawUrl.startsWith("api/");

    if (!API.baseUrl && isGithubPages && isApiPath) {
      throw new Error(
        "API nao configurada para o GitHub Pages. Defina gd_api_base_url com a URL do backend."
      );
    }

    const requestUrl = API.resolveUrl(url);
    const response = await fetch(requestUrl, options);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const rawBody = await response.text();

    let data = null;
    if (rawBody) {
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(rawBody);
        } catch (_error) {
          throw new Error("Resposta JSON invalida recebida da API.");
        }
      } else if (rawBody.trim().startsWith("{") || rawBody.trim().startsWith("[")) {
        try {
          data = JSON.parse(rawBody);
        } catch (_error) {
          data = null;
        }
      }
    }

    if (!response.ok) {
      if (data && typeof data === "object" && data.error) {
        throw new Error(data.error);
      }

      if (rawBody.trim().startsWith("<")) {
        throw new Error(
          "A resposta da API veio em HTML. Verifique se o backend esta ativo e configure gd_api_base_url para a URL correta da API."
        );
      }

      throw new Error(`Erro na requisicao (${response.status}).`);
    }

    if (!data) {
      if (rawBody.trim().startsWith("<")) {
        throw new Error(
          "A resposta da API veio em HTML. Verifique se o backend esta ativo e configure gd_api_base_url para a URL correta da API."
        );
      }
      throw new Error("Resposta inesperada da API.");
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
