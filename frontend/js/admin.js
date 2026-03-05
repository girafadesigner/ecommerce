const adminMessage = document.getElementById("adminMessage");
const categoryForm = document.getElementById("categoryForm");
const productForm = document.getElementById("productForm");
const adminChangePasswordForm = document.getElementById("adminChangePasswordForm");
const toggleChangePasswordLink = document.getElementById("toggleChangePasswordLink");
const adminNavButtons = document.querySelectorAll("[data-admin-section]");
const adminSections = document.querySelectorAll("[data-admin-section-content]");
const categorySelect = document.getElementById("categoryId");
const pendingOrdersBody = document.getElementById("pendingOrdersBody");
const productionOrdersBody = document.getElementById("productionOrdersBody");
const historyOrdersBody = document.getElementById("historyOrdersBody");
const productsBody = document.getElementById("adminProductsBody");
const customersReportBody = document.getElementById("customersReportBody");
const manualSaleForm = document.getElementById("manualSaleForm");
const manualSaleItemsWrap = document.getElementById("manualSaleItemsWrap");
const addManualSaleItemBtn = document.getElementById("addManualSaleItemBtn");
const manualCustomerPhone = document.getElementById("manualCustomerPhone");
const inventoryPurchaseForm = document.getElementById("inventoryPurchaseForm");
const inventoryPurchasesBody = document.getElementById("inventoryPurchasesBody");
const purchaseProductId = document.getElementById("purchaseProductId");
const dashboardRange = document.getElementById("dashboardRange");
const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
const metricRevenue = document.getElementById("metricRevenue");
const metricReceivable = document.getElementById("metricReceivable");
const metricInventoryPurchases = document.getElementById("metricInventoryPurchases");
const metricOperatingCashflow = document.getElementById("metricOperatingCashflow");
const metricCost = document.getElementById("metricCost");
const metricProfit = document.getElementById("metricProfit");
const metricMargin = document.getElementById("metricMargin");
const metricConfirmed = document.getElementById("metricConfirmed");
const metricPending = document.getElementById("metricPending");
const metricTicket = document.getElementById("metricTicket");
const revenueLineChart = document.getElementById("revenueLineChart");
const statusDistributionChart = document.getElementById("statusDistributionChart");
const topProductsChart = document.getElementById("topProductsChart");
let cachedAdminProducts = [];
let cachedCategories = [];
let editingProductId = null;

const token = localStorage.getItem("gd_admin_token");
if (!token) {
  window.location.href = "/admin";
}

function setMessage(text, isError = false) {
  adminMessage.innerHTML = `<div class="message ${isError ? "error" : "success"}">${text}</div>`;
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`
  };
}

function formatSqliteUtcToBr(dateValue) {
  if (!dateValue) return "-";
  const isoUtc = `${String(dateValue).replace(" ", "T")}Z`;
  const parsed = new Date(isoUtc);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium"
  }).format(parsed);
}

function orderStatusLabel(status) {
  if (status === "em_producao" || status === "in_production") return "Em producao";
  if (status === "pronto_entrega" || status === "pending_delivery") return "Pronto para entrega";
  if (status === "entregue" || status === "delivered") return "Entregue";
  if (status === "cancelado" || status === "cancelled") return "Cancelado";
  return "Pendente";
}

function paymentStatusLabel(status) {
  if (status === "pago" || status === "paid") return "Pago";
  if (status === "parcial") return "Parcial";
  return "Pagamento pendente";
}

function formatDayLabel(dayValue) {
  if (!dayValue) return "-";
  const [year, month, day] = String(dayValue).split("-");
  if (!year || !month || !day) return dayValue;
  return `${day}/${month}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCategoryOptionsHtml(selectedId = "") {
  const normalizedSelectedId =
    selectedId === null || selectedId === undefined || selectedId === "" ? "" : Number(selectedId);
  const options = ['<option value="">Sem categoria</option>'];
  cachedCategories.forEach((category) => {
    const isSelected = Number(category.id) === normalizedSelectedId ? "selected" : "";
    options.push(`<option value="${category.id}" ${isSelected}>${escapeHtml(category.name)}</option>`);
  });
  return options.join("");
}

function getPriceInsight(product, override = null) {
  const cost = Number(override?.cost_price ?? product.cost_price ?? 0);
  const price = Number(override?.price ?? product.price ?? 0);
  const categoryIdRaw = override?.category_id ?? product.category_id;
  const categoryId =
    categoryIdRaw === null || categoryIdRaw === undefined || categoryIdRaw === "" ? null : Number(categoryIdRaw);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0) {
    return {
      badgeClass: "is-warning",
      badgeText: "Revisar",
      message: "Preencha preco e custo validos para gerar insight."
    };
  }

  const marginPercent = ((price - cost) / price) * 100;
  const categoryProducts = cachedAdminProducts.filter((item) => {
    if (Number(item.id) === Number(product.id)) return false;
    if (categoryId === null) return item.category_id === null || item.category_id === undefined;
    return Number(item.category_id) === categoryId;
  });
  const categoryAvgPrice = categoryProducts.length
    ? categoryProducts.reduce((sum, item) => sum + Number(item.price || 0), 0) / categoryProducts.length
    : null;

  if (cost >= price) {
    const loss = cost - price;
    return {
      badgeClass: "is-danger",
      badgeText: "Prejuizo",
      message: `Produto no prejuizo de ${API.formatCurrency(
        loss
      )} por unidade. Ajuste preco acima de ${API.formatCurrency(cost)}.`
    };
  }

  if (marginPercent < 20) {
    const suggested = cost / 0.65;
    let message = `Margem baixa (${marginPercent.toFixed(
      1
    )}%). Sugestao: testar preco proximo de ${API.formatCurrency(suggested)} para buscar margem de 35%.`;
    if (categoryAvgPrice && price < categoryAvgPrice * 0.9) {
      message += ` Mercado interno da categoria: sua oferta esta abaixo da media (${API.formatCurrency(
        categoryAvgPrice
      )}).`;
    }
    return {
      badgeClass: "is-warning",
      badgeText: "Ajustar",
      message
    };
  }

  if (marginPercent > 65) {
    let message = `Margem alta (${marginPercent.toFixed(1)}%).`;
    if (categoryAvgPrice && price > categoryAvgPrice * 1.25) {
      message += ` Preco acima da media da categoria (${API.formatCurrency(
        categoryAvgPrice
      )}); valide se isso afeta conversao.`;
    } else {
      message += " Monitore conversao para garantir que o preco nao esteja travando vendas.";
    }
    return {
      badgeClass: "is-info",
      badgeText: "Monitorar",
      message
    };
  }

  return {
    badgeClass: "is-good",
    badgeText: "Saudavel",
    message: `Margem estimada de ${marginPercent.toFixed(1)}%. Faixa equilibrada para proteger lucro sem pressionar preco.`
  };
}

function getProductOptionsHtml(selectedId = "") {
  return cachedAdminProducts
    .map((product) => {
      const selected = Number(selectedId) === Number(product.id) ? "selected" : "";
      return `<option value="${product.id}" ${selected}>${product.name}</option>`;
    })
    .join("");
}

function syncInventoryPurchaseProductOptions() {
  if (!purchaseProductId) return;
  purchaseProductId.innerHTML = "";
  if (!cachedAdminProducts.length) {
    purchaseProductId.innerHTML = '<option value="">Cadastre produtos primeiro</option>';
    return;
  }
  cachedAdminProducts.forEach((product) => {
    const option = document.createElement("option");
    option.value = String(product.id);
    option.textContent = product.name;
    purchaseProductId.appendChild(option);
  });
}

function addManualSaleItemRow(defaultItem = null) {
  if (!manualSaleItemsWrap) return;
  if (!cachedAdminProducts.length) {
    manualSaleItemsWrap.innerHTML = "<p style='margin: 0'>Cadastre produtos para lancar vendas.</p>";
    return;
  }

  const baseProduct = defaultItem
    ? cachedAdminProducts.find((item) => Number(item.id) === Number(defaultItem.product_id))
    : cachedAdminProducts[0];
  const defaultPrice = Number(defaultItem?.unit_price ?? baseProduct?.price ?? 0);
  const defaultQuantity = Number(defaultItem?.quantity ?? 1);

  const row = document.createElement("div");
  row.className = "manual-sale-item-row";
  row.innerHTML = `
    <select class="manual-item-product" required>
      ${getProductOptionsHtml(baseProduct?.id)}
    </select>
    <input class="manual-item-qty" type="number" min="1" step="1" value="${defaultQuantity}" required />
    <input class="manual-item-price" type="number" min="0" step="0.01" value="${defaultPrice}" required />
    <button type="button" class="secondary" data-remove-manual-item>Remover</button>
  `;
  manualSaleItemsWrap.appendChild(row);
}

function formatPhoneForDisplay(value) {
  const formatted = API.formatPhoneBr(value);
  return formatted || "-";
}

function setActiveAdminSection(sectionName) {
  adminNavButtons.forEach((button) => {
    const isActive = button.getAttribute("data-admin-section") === sectionName;
    button.classList.toggle("is-active", isActive);
  });

  adminSections.forEach((section) => {
    const isActive = section.getAttribute("data-admin-section-content") === sectionName;
    section.classList.toggle("is-active", isActive);
  });
}

function renderRevenueLineChart(dailyData) {
  revenueLineChart.innerHTML = "";
  if (!dailyData.length) {
    revenueLineChart.innerHTML = '<p style="margin:0">Sem pedidos no periodo selecionado.</p>';
    return;
  }

  const values = dailyData.map((item) => Number(item.revenue || 0));
  const maxValue = Math.max(...values, 1);
  const width = 620;
  const height = 240;
  const padding = 28;

  const points = dailyData.map((item, index) => {
    const x =
      padding +
      (index * (width - padding * 2)) / Math.max(1, dailyData.length - 1);
    const y = height - padding - (Number(item.revenue || 0) / maxValue) * (height - padding * 2);
    return { x, y, day: formatDayLabel(item.day), revenue: Number(item.revenue || 0) };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} ${(height - padding).toFixed(
    1
  )} L ${points[0].x.toFixed(1)} ${(height - padding).toFixed(1)} Z`;

  const labels = points
    .filter((_, index) => index % Math.max(1, Math.ceil(points.length / 6)) === 0 || index === points.length - 1)
    .map(
      (point) =>
        `<div class="line-chart-label"><span>${point.day}</span><strong>${API.formatCurrency(
          point.revenue
        )}</strong></div>`
    )
    .join("");

  revenueLineChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="line-chart-svg" role="img" aria-label="Grafico de receita por dia">
      <defs>
        <linearGradient id="lineAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f2b705" stop-opacity="0.35"></stop>
          <stop offset="100%" stop-color="#f2b705" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#lineAreaFill)"></path>
      <path d="${path}" class="line-chart-path"></path>
      ${points
        .map(
          (point) =>
            `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5" class="line-chart-dot"></circle>`
        )
        .join("")}
    </svg>
    <div class="line-chart-labels">${labels}</div>
  `;
}

function renderStatusDistribution(summary) {
  const total =
    Number(summary.pending_orders || 0) +
    Number(summary.confirmed_orders || 0) +
    Number(summary.abandoned_orders || 0);

  if (!total) {
    statusDistributionChart.innerHTML = "<p style='margin:0'>Sem pedidos no periodo.</p>";
    return;
  }

  const segments = [
    { label: "Confirmados", value: Number(summary.confirmed_orders || 0), color: "#1f8f79" },
    { label: "Pendentes", value: Number(summary.pending_orders || 0), color: "#f2b705" },
    { label: "Desistidos", value: Number(summary.abandoned_orders || 0), color: "#b8362f" }
  ].filter((item) => item.value > 0);

  let cursor = 0;
  const stripe = segments
    .map((segment) => {
      const start = cursor;
      const ratio = (segment.value / total) * 100;
      const end = start + ratio;
      cursor = end;
      return `${segment.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ");

  statusDistributionChart.innerHTML = `
    <div class="status-ring" style="background: conic-gradient(${stripe})">
      <div class="status-ring-center">
        <strong>${total}</strong>
        <span>Pedidos</span>
      </div>
    </div>
    <div class="status-legend">
      ${segments
        .map(
          (segment) => `
            <div class="status-legend-item">
              <span class="status-color" style="background:${segment.color}"></span>
              <span>${segment.label}</span>
              <strong>${segment.value}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTopProductsChart(products) {
  topProductsChart.innerHTML = "";
  if (!products.length) {
    topProductsChart.innerHTML = "<p style='margin:0'>Sem vendas confirmadas no periodo.</p>";
    return;
  }

  const maxRevenue = Math.max(...products.map((item) => Number(item.revenue || 0)), 1);
  topProductsChart.innerHTML = products
    .map((product) => {
      const revenue = Number(product.revenue || 0);
      const ratio = Math.max(4, Math.round((revenue / maxRevenue) * 100));
      return `
        <div class="product-bar-row">
          <div class="product-bar-title">
            <strong>${product.name}</strong>
            <span>${product.units_sold} un.</span>
          </div>
          <div class="product-bar-track">
            <div class="product-bar-fill" style="width:${ratio}%"></div>
          </div>
          <strong>${API.formatCurrency(revenue)}</strong>
        </div>
      `;
    })
    .join("");
}

async function loadCategories() {
  const categories = await API.request("/api/categories");
  cachedCategories = categories;
  categorySelect.innerHTML = "";
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
}

function updateEditInsightRow(row, product) {
  const costInput = row.querySelector(".edit-cost");
  const priceInput = row.querySelector(".edit-price");
  const categoryInput = row.querySelector(".edit-category");
  const badge = row.querySelector("[data-edit-insight-badge]");
  const tooltip = row.querySelector("[data-edit-insight-tip]");
  if (!costInput || !priceInput || !categoryInput || !badge || !tooltip) return;

  const insight = getPriceInsight(product, {
    cost_price: costInput.value,
    price: priceInput.value,
    category_id: categoryInput.value
  });
  badge.className = `insight-badge ${insight.badgeClass}`;
  badge.textContent = insight.badgeText;
  tooltip.textContent = insight.message;
}

function startProductEdit(productId) {
  const product = cachedAdminProducts.find((item) => Number(item.id) === Number(productId));
  if (!product) return;

  const row = productsBody.querySelector(`tr[data-product-id="${product.id}"]`);
  if (!row) return;

  editingProductId = Number(product.id);
  row.classList.add("is-editing");
  row.innerHTML = `
    <td>${product.id}</td>
    <td>
      <input class="edit-name" type="text" value="${escapeHtml(product.name)}" />
    </td>
    <td>
      <input class="edit-cost" type="number" min="0" step="0.01" value="${Number(product.cost_price || 0)}" />
    </td>
    <td>
      <input class="edit-price" type="number" min="0" step="0.01" value="${Number(product.price || 0)}" />
    </td>
    <td>
      <select class="edit-category">${getCategoryOptionsHtml(product.category_id)}</select>
    </td>
    <td>
      <div class="insight-cell">
        <span class="insight-badge is-info" data-edit-insight-badge>Em edicao</span>
        <span class="insight-wrap">
          <span class="info-dot" tabindex="0">i</span>
          <span class="insight-tooltip" data-edit-insight-tip></span>
        </span>
      </div>
    </td>
    <td class="row-actions">
      <button class="accent" data-save-id="${product.id}">Salvar</button>
      <button class="secondary" data-cancel-edit-id="${product.id}">Cancelar</button>
    </td>
  `;

  const refreshInsight = () => updateEditInsightRow(row, product);
  row.querySelector(".edit-cost")?.addEventListener("input", refreshInsight);
  row.querySelector(".edit-price")?.addEventListener("input", refreshInsight);
  row.querySelector(".edit-category")?.addEventListener("change", refreshInsight);
  refreshInsight();
}

async function loadProducts() {
  const products = await API.request("/api/admin/products", {
    headers: authHeaders()
  });
  cachedAdminProducts = products;

  productsBody.innerHTML = "";
  products.forEach((product) => {
    const insight = getPriceInsight(product);
    const row = document.createElement("tr");
    row.setAttribute("data-product-id", String(product.id));
    row.innerHTML = `
      <td>${product.id}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${API.formatCurrency(product.cost_price || 0)}</td>
      <td>${API.formatCurrency(product.price)}</td>
      <td>${escapeHtml(product.category_name || "-")}</td>
      <td>
        <div class="insight-cell">
          <span class="insight-badge ${insight.badgeClass}">${insight.badgeText}</span>
          <span class="insight-wrap">
            <span class="info-dot" tabindex="0">i</span>
            <span class="insight-tooltip">${escapeHtml(insight.message)}</span>
          </span>
        </div>
      </td>
      <td class="row-actions">
        <button class="secondary" data-edit-id="${product.id}">Editar</button>
        <button data-delete-id="${product.id}">Excluir</button>
      </td>
    `;
    productsBody.appendChild(row);
  });

  if (editingProductId) {
    startProductEdit(editingProductId);
  }
  syncInventoryPurchaseProductOptions();

  if (manualSaleItemsWrap && manualSaleItemsWrap.children.length === 0) {
    addManualSaleItemRow();
  } else if (manualSaleItemsWrap) {
    const selects = manualSaleItemsWrap.querySelectorAll(".manual-item-product");
    selects.forEach((select) => {
      const selected = select.value;
      select.innerHTML = getProductOptionsHtml(selected);
    });
  }
}

async function loadInventoryPurchases() {
  if (!inventoryPurchasesBody) return;
  const rows = await API.request("/api/admin/inventory-purchases?limit=120", {
    headers: authHeaders()
  });
  inventoryPurchasesBody.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("tr");
    empty.innerHTML = "<td colspan='7'>Nenhuma compra registrada.</td>";
    inventoryPurchasesBody.appendChild(empty);
    return;
  }

  rows.forEach((purchase) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatSqliteUtcToBr(purchase.purchased_at)}</td>
      <td>${escapeHtml(purchase.product_name || "-")}</td>
      <td>${escapeHtml(purchase.supplier_name || "-")}</td>
      <td>${Number(purchase.quantity || 0)}</td>
      <td>${API.formatCurrency(purchase.unit_cost || 0)}</td>
      <td>${API.formatCurrency(purchase.total_cost || 0)}</td>
      <td>${escapeHtml(purchase.notes || "-")}</td>
    `;
    inventoryPurchasesBody.appendChild(tr);
  });
}

function renderOrdersTableRows(targetBody, orders, mode) {
  if (!targetBody) return;
  targetBody.innerHTML = "";

  if (!orders.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7">Nenhum pedido encontrado.</td>`;
    targetBody.appendChild(row);
    return;
  }

  orders.forEach((order) => {
    const productionStatus =
      order.production_status ||
      (order.status === "in_production"
        ? "em_producao"
        : order.status === "pending_delivery"
          ? "pronto_entrega"
          : order.status === "delivered"
            ? "entregue"
            : order.status === "cancelled"
              ? "cancelado"
              : "pendente");
    const isManualOrder = String(order.client_id || "").startsWith("manual_");
    const paymentStatus = order.payment_summary_status || "nao_pago";
    const totalAmount = Number(order.total || 0);
    const paidAmount = Math.max(0, Number(order.paid_amount || 0));
    const balance = Math.max(0, totalAmount - paidAmount);
    const canConfirmPayment = balance > 0;
    const canResetPayment = paidAmount > 0;
    const canMoveToProduction = productionStatus === "pendente";
    const canMoveToDelivery = productionStatus === "em_producao";
    const canConfirmDelivered = productionStatus === "pronto_entrega";
    const canCancel = productionStatus !== "cancelado";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>#${order.id}</td>
      <td>${order.customer_name || "-"}</td>
      <td>${order.customer_email || "-"}<br/>${formatPhoneForDisplay(order.customer_phone)}</td>
      <td>${API.formatCurrency(totalAmount)}<br/><small>Pago: ${API.formatCurrency(paidAmount)} | Saldo: ${API.formatCurrency(balance)}</small></td>
      <td>
        <span class="status-chip ${productionStatus}">${orderStatusLabel(productionStatus)}</span><br/>
        <span class="status-chip payment-${paymentStatus}">${paymentStatusLabel(paymentStatus)}</span>
      </td>
      <td>${formatSqliteUtcToBr(order.created_at)}</td>
      <td class="row-actions order-actions">
        ${canConfirmPayment ? `<button class="accent order-action-btn" data-payment-action="registrar" data-order-id="${order.id}" data-order-balance="${balance}">Registrar pagamento</button>` : ""}
        ${canConfirmPayment ? `<button class="accent order-action-btn" data-payment-action="quitar_total" data-order-id="${order.id}" data-order-balance="${balance}">Quitar 100%</button>` : ""}
        ${canResetPayment ? `<button class="secondary order-action-btn" data-payment-action="marcar_pendente" data-order-id="${order.id}">Marcar pendente</button>` : ""}
        ${canMoveToProduction && mode !== "history" ? `<button class="accent order-action-btn" data-order-action="em_producao" data-order-id="${order.id}">Enviar para producao</button>` : ""}
        ${canMoveToDelivery && mode !== "history" ? `<button class="accent order-action-btn" data-order-action="pronto_entrega" data-order-id="${order.id}">Pronto entrega</button>` : ""}
        ${canConfirmDelivered && mode !== "history" ? `<button class="accent order-action-btn" data-order-action="entregue" data-order-id="${order.id}">Confirmar entrega</button>` : ""}
        ${
          canCancel
            ? `<button class="secondary order-action-btn" data-order-action="cancelado" data-order-id="${order.id}" data-remove-on-cancel="${
                productionStatus === "pendente" ? "1" : "0"
              }">${productionStatus === "pendente" ? "Cancelar e remover" : "Cancelar"}</button>`
            : ""
        }
        ${
          isManualOrder
            ? `<button class="order-action-btn" data-delete-order-id="${order.id}">Excluir lancamento</button>`
            : ""
        }
      </td>
    `;
    targetBody.appendChild(row);
  });
}

async function loadOrders() {
  const [pendingOrders, productionOrders, historyOrders] = await Promise.all([
    API.request("/api/admin/orders?scope=pending", {
      headers: authHeaders()
    }),
    API.request("/api/admin/orders?scope=production", {
      headers: authHeaders()
    }),
    API.request("/api/admin/orders?scope=history", {
      headers: authHeaders()
    })
  ]);

  const productionStatuses = new Set(["em_producao", "pronto_entrega"]);

  const pendingScoped = pendingOrders.filter((order) => String(order.production_status || "") === "pendente");
  const productionScoped = productionOrders.filter((order) =>
    productionStatuses.has(String(order.production_status || ""))
  );
  const historyScoped = historyOrders.filter((order) => {
    const status = String(order.production_status || "");
    return status !== "pendente" && !productionStatuses.has(status);
  });

  renderOrdersTableRows(pendingOrdersBody, pendingScoped, "pending");
  renderOrdersTableRows(productionOrdersBody, productionScoped, "production");
  renderOrdersTableRows(historyOrdersBody, historyScoped, "history");
}

async function loadCustomerReport() {
  const customers = await API.request("/api/admin/reports/customers", {
    headers: authHeaders()
  });

  customersReportBody.innerHTML = "";
  customers.forEach((customer) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${customer.name}</td>
      <td>${customer.email}</td>
      <td>${formatPhoneForDisplay(customer.phone)}</td>
      <td>${customer.total_orders}</td>
      <td>${API.formatCurrency(customer.total_spent)}</td>
      <td>${formatSqliteUtcToBr(customer.last_purchase)}</td>
    `;
    customersReportBody.appendChild(row);
  });
}

async function loadSalesDashboard() {
  const range = dashboardRange?.value || "30";
  const data = await API.request(`/api/admin/reports/sales-dashboard?days=${encodeURIComponent(range)}`, {
    headers: authHeaders()
  });

  metricRevenue.textContent = API.formatCurrency(data.summary.confirmed_revenue);
  if (metricReceivable) {
    metricReceivable.textContent = API.formatCurrency(data.summary.receivable || 0);
  }
  if (metricInventoryPurchases) {
    metricInventoryPurchases.textContent = API.formatCurrency(data.summary.inventory_purchase_cost || 0);
  }
  if (metricOperatingCashflow) {
    metricOperatingCashflow.textContent = API.formatCurrency(data.summary.operating_cashflow || 0);
  }
  metricCost.textContent = API.formatCurrency(data.summary.confirmed_cost || 0);
  const soldRevenue = Number(data.summary.sold_revenue || 0);
  const soldProfit = soldRevenue - Number(data.summary.confirmed_cost || 0);
  metricProfit.textContent = API.formatCurrency(soldProfit);
  metricMargin.textContent = `${soldRevenue > 0 ? ((soldProfit / soldRevenue) * 100).toFixed(1) : "0.0"}%`;
  metricConfirmed.textContent = String(data.summary.confirmed_orders);
  metricPending.textContent = String(data.summary.pending_orders);
  metricTicket.textContent = API.formatCurrency(data.summary.average_ticket);

  renderRevenueLineChart(data.daily);
  renderStatusDistribution(data.summary);
  renderTopProductsChart(data.top_products);
}

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const name = document.getElementById("categoryName").value.trim();
    await API.request("/api/admin/categories", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name })
    });
    document.getElementById("categoryName").value = "";
    await loadCategories();
    setMessage("Categoria criada com sucesso.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(productForm);
    await API.request("/api/admin/products", {
      method: "POST",
      headers: authHeaders(),
      body: formData
    });
    productForm.reset();
    await loadProducts();
    setMessage("Produto cadastrado com sucesso.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

manualSaleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const itemRows = Array.from(manualSaleItemsWrap.querySelectorAll(".manual-sale-item-row"));
    const items = itemRows.map((row) => ({
      product_id: Number(row.querySelector(".manual-item-product")?.value),
      quantity: Number(row.querySelector(".manual-item-qty")?.value),
      unit_price: Number(row.querySelector(".manual-item-price")?.value)
    }));

    if (!items.length) {
      setMessage("Adicione ao menos um item na venda manual.", true);
      return;
    }

    const payload = {
      customer_name: document.getElementById("manualCustomerName").value.trim(),
      customer_email: document.getElementById("manualCustomerEmail").value.trim(),
      customer_phone: String(document.getElementById("manualCustomerPhone").value || "").replace(/\D/g, ""),
      channel: document.getElementById("manualSaleChannel").value,
      status: document.getElementById("manualSaleStatus").value,
      production_status: document.getElementById("manualSaleStatus").value,
      initial_paid_amount: Number(document.getElementById("manualInitialPaidAmount").value || 0),
      payment_method: document.getElementById("manualPaymentMethod").value,
      payment_type: document.getElementById("manualPaymentType").value,
      payment_note: document.getElementById("manualPaymentNote").value.trim(),
      notes: document.getElementById("manualSaleNotes").value.trim(),
      items
    };

    const data = await API.request("/api/admin/manual-sales", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    manualSaleForm.reset();
    manualSaleItemsWrap.innerHTML = "";
    addManualSaleItemRow();
    await loadOrders();
    await loadCustomerReport();
    await loadSalesDashboard();
    setMessage(`Venda #${data.orderId} lancada com sucesso.`);
  } catch (error) {
    setMessage(error.message, true);
  }
});

inventoryPurchaseForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = {
      product_id: Number(document.getElementById("purchaseProductId")?.value),
      supplier_name: document.getElementById("purchaseSupplierName")?.value.trim(),
      quantity: Number(document.getElementById("purchaseQuantity")?.value),
      unit_cost: Number(document.getElementById("purchaseUnitCost")?.value),
      purchased_at: document.getElementById("purchaseDateTime")?.value,
      notes: document.getElementById("purchaseNotes")?.value.trim()
    };

    await API.request("/api/admin/inventory-purchases", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    inventoryPurchaseForm.reset();
    await loadInventoryPurchases();
    await loadSalesDashboard();
    setMessage("Compra de estoque registrada.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

adminChangePasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const currentPassword = document.getElementById("adminCurrentPassword").value;
    const newPassword = document.getElementById("adminNewPassword").value;

    await API.request("/api/admin/change-password", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ currentPassword, newPassword })
    });

    adminChangePasswordForm.reset();
    setMessage("Senha do admin alterada com sucesso.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

toggleChangePasswordLink?.addEventListener("click", (event) => {
  event.preventDefault();
  const isHidden = adminChangePasswordForm.style.display === "none";
  adminChangePasswordForm.style.display = isHidden ? "grid" : "none";
  toggleChangePasswordLink.textContent = isHidden ? "Cancelar alteracao de senha" : "Alterar senha";
});

adminNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveAdminSection(button.getAttribute("data-admin-section"));
  });
});

addManualSaleItemBtn?.addEventListener("click", () => addManualSaleItemRow());
manualCustomerPhone?.addEventListener("input", () => {
  manualCustomerPhone.value = API.formatPhoneBr(manualCustomerPhone.value);
});

document.addEventListener("change", (event) => {
  if (!event.target.matches(".manual-item-product")) return;

  const select = event.target;
  const row = select.closest(".manual-sale-item-row");
  const priceInput = row?.querySelector(".manual-item-price");
  const selectedProduct = cachedAdminProducts.find(
    (item) => Number(item.id) === Number(select.value)
  );
  if (priceInput && selectedProduct) {
    priceInput.value = Number(selectedProduct.price || 0);
  }
});

document.addEventListener("click", async (event) => {
  const removeManualBtn = event.target.closest("[data-remove-manual-item]");
  if (removeManualBtn) {
    const row = removeManualBtn.closest(".manual-sale-item-row");
    if (row) row.remove();
    if (!manualSaleItemsWrap.querySelector(".manual-sale-item-row")) {
      addManualSaleItemRow();
    }
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  const deleteId = deleteButton?.getAttribute("data-delete-id");
  if (deleteId) {
    try {
      await API.request(`/api/admin/products/${deleteId}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      await loadProducts();
      setMessage("Produto excluido.");
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  const cancelEditButton = event.target.closest("[data-cancel-edit-id]");
  const cancelEditId = cancelEditButton?.getAttribute("data-cancel-edit-id");
  if (cancelEditId) {
    editingProductId = null;
    await loadProducts();
  }

  const saveButton = event.target.closest("[data-save-id]");
  const saveId = saveButton?.getAttribute("data-save-id");
  if (saveId) {
    const row = saveButton.closest("tr");
    const nameInput = row?.querySelector(".edit-name");
    const costInput = row?.querySelector(".edit-cost");
    const priceInput = row?.querySelector(".edit-price");
    const categoryInput = row?.querySelector(".edit-category");
    const name = String(nameInput?.value || "").trim();
    const costPrice = Number(costInput?.value);
    const price = Number(priceInput?.value);
    const categoryValue = String(categoryInput?.value || "").trim();

    if (!name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
      setMessage("Revise nome, preco e custo antes de salvar.", true);
      return;
    }

    try {
      await API.request(`/api/admin/products/${saveId}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name,
          price,
          cost_price: costPrice,
          category_id: categoryValue ? Number(categoryValue) : null
        })
      });
      editingProductId = null;
      await loadProducts();
      setMessage("Produto atualizado.");
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  const editButton = event.target.closest("[data-edit-id]");
  const editId = editButton?.getAttribute("data-edit-id");
  if (editId) {
    const nextEditId = Number(editId);
    if (editingProductId && editingProductId !== nextEditId) {
      editingProductId = null;
      await loadProducts();
    }
    startProductEdit(nextEditId);
  }

  const orderButton = event.target.closest("[data-order-id][data-order-action]");
  const orderId = orderButton?.getAttribute("data-order-id");
  const orderAction = orderButton?.getAttribute("data-order-action");
  if (orderId && orderAction) {
    const removeOnCancel = orderButton?.getAttribute("data-remove-on-cancel") === "1";
    try {
      if (orderAction === "cancelled" && removeOnCancel) {
        await API.request(`/api/admin/orders/${orderId}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      } else {
        await API.request(`/api/admin/orders/${orderId}/status`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ status: orderAction })
        });
      }
      await loadOrders();
      await loadCustomerReport();
      await loadSalesDashboard();
      setMessage(
        orderAction === "cancelled" && removeOnCancel
          ? "Pedido pendente removido."
          : "Status do pedido atualizado."
      );
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  const paymentButton = event.target.closest("[data-order-id][data-payment-action]");
  const paymentOrderId = paymentButton?.getAttribute("data-order-id");
  const paymentAction = paymentButton?.getAttribute("data-payment-action");
  if (paymentOrderId && paymentAction) {
    try {
      if (paymentAction === "marcar_pendente") {
        const confirmedReset = window.confirm(
          "Deseja marcar como pendente e zerar os pagamentos registrados desse pedido?"
        );
        if (!confirmedReset) return;
        await API.request(`/api/admin/orders/${paymentOrderId}/payments`, {
          method: "DELETE",
          headers: authHeaders()
        });
      } else {
        const balance = Number(paymentButton?.getAttribute("data-order-balance") || 0);
        const amount =
          paymentAction === "quitar_total"
            ? balance
            : Number(
                String(
                  window.prompt(
                    `Valor do pagamento recebido (saldo atual ${API.formatCurrency(balance)}):`,
                    String(balance > 0 ? balance : "")
                  ) || ""
                ).replace(",", ".")
              );

        if (!Number.isFinite(amount) || amount <= 0) {
          setMessage("Valor de pagamento invalido.", true);
          return;
        }

        await API.request(`/api/admin/orders/${paymentOrderId}/payments`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            amount,
            method: "pix",
            type: paymentAction === "quitar_total" ? "saldo_entrega" : "parcial"
          })
        });
      }

      await loadOrders();
      await loadCustomerReport();
      await loadSalesDashboard();
      setMessage(
        paymentAction === "marcar_pendente"
          ? "Pedido marcado como pagamento pendente."
          : "Pagamento registrado."
      );
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  const deleteOrderButton = event.target.closest("[data-delete-order-id]");
  const deleteOrderId = deleteOrderButton?.getAttribute("data-delete-order-id");
  if (deleteOrderId) {
    const confirmed = window.confirm(
      `Confirma excluir o lancamento manual #${deleteOrderId}? Essa acao nao pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      await API.request(`/api/admin/orders/${deleteOrderId}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      await loadOrders();
      await loadCustomerReport();
      await loadSalesDashboard();
      setMessage("Lancamento manual removido.");
    } catch (error) {
      setMessage(error.message, true);
    }
  }
});

document.getElementById("logoutBtn").addEventListener("click", (event) => {
  event.preventDefault();
  localStorage.removeItem("gd_admin_token");
  window.location.href = "/admin";
});

refreshDashboardBtn?.addEventListener("click", async () => {
  try {
    await loadSalesDashboard();
  } catch (error) {
    setMessage(error.message, true);
  }
});

dashboardRange?.addEventListener("change", async () => {
  try {
    await loadSalesDashboard();
  } catch (error) {
    setMessage(error.message, true);
  }
});

(async function bootstrap() {
  try {
    await loadSalesDashboard();
    await loadCategories();
    await loadOrders();
    await loadProducts();
    await loadInventoryPurchases();
    await loadCustomerReport();
  } catch (error) {
    localStorage.removeItem("gd_admin_token");
    window.location.href = "/admin";
  }
})();
